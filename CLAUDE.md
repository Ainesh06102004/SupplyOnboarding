# KOI — Engineering Guide

KOI is a health-first commerce platform in India. Products are listed **only** after passing a nutritional screen. Two products live in this repo:

| Module | Route prefix | Audience |
|---|---|---|
| **Brand Onboarding** | `/onboarding`, `/dashboard` | FMCG brands submitting catalogues for screening |
| **Storefront** | `/store/**` | Shoppers buying screened products |

`web/CLAUDE.md` → `web/AGENTS.md` carries a generated Next.js notice. Leave both alone; this file is the human-authored guide.

---

## Commands

```bash
cd web
npm run dev      # next dev (turbopack)
npm run build    # next build — must pass before any PR
npm run lint     # eslint
```

There is **no test runner**. `web/test_supabase.js` and `web/test-supabase.js` are ad-hoc scratch scripts, not tests — do not treat them as a suite, and do not add to them. If you introduce testable logic, propose a runner rather than writing untested pure functions and calling it done.

## Stack

Next.js `16.2.9` (App Router) · React `19.2.4` · Tailwind **v4** (PostCSS, no `tailwind.config.js`) · Zustand · Supabase (data) · Firebase (auth) · shadcn on `@base-ui/react` · Zod + react-hook-form · framer-motion · lucide-react.

Import alias: `@/*` → `web/src/*`. Always use it; never write `../../..`.

> **Next.js 16 and React 19 differ from most training data.** Before writing routing, caching, `params`/`searchParams`, metadata, or server-action code, read the relevant page in `node_modules/next/dist/docs/`. Do not pattern-match from Next 13/14 memory.

---

## Layout

```
supabase/migrations/     schema — the FILES; the live DB has diverged (see Supabase)
docs/                    phase write-ups (background, not spec)
web/src/
  app/                   routes (App Router)
    store/               ── THE STOREFRONT ──
      page.js              landing
      shop/page.js         discovery + search + filters   (orchestrator, 341 ln)
      product/[id]/        product story
      cart/ checkout/ orders/ profile/
      StoreNavigation.js   app-shell nav (cart/orders/profile)
    api/auth/session/    Firebase token → `koi-auth-token` cookie
  components/store/
    landing/             editorial primitives + tokens.js
    shop/                shop UI: CommandSearch, GoalSetup, PersonalShelves, ShopSections
    product/             ProductHero, ProductStory, BuyPanel, productData.js
  lib/
    recommendation/      ── THE KRE — read before touching ranking ──
    data/productFetcher.js   Supabase row → frontend product shape
    supabase/ firebase/
  store/                 Zustand: cartStore, goalStore, onboardingStore
  contexts/              AuthContext, LocationContext
  middleware.js          gates /store/{profile,checkout,orders}
```

---

## The KOI Recommendation Engine (KRE)

`lib/recommendation/` is the best-engineered code in this repo. **Match its standard; do not lower it.**

```
generateCandidates → filterEligible → scoreProduct → strategy.rank → buildShelves
   availability        HARD only       pure, weighted   swappable      named shelves
```

Rules, in priority order:

1. **Eligibility eliminates; scoring ranks. Never blur them.** A hard constraint — diet type, allergen — removes a product in `eligibilityFilter.js`. It must *never* become a low score. Deprioritising peanuts for an allergic shopper is a safety failure, not a ranking nuance. Soft avoids (palm oil, refined sugar) belong in `PENALTIES`.
2. **Ranking is the only swappable stage.** `AIRankingStrategy` exists as a placeholder with the same contract. AI may re-order an already-scored list. It may never regenerate candidates, override eligibility, or invent a score.
3. **Everything upstream of ranking is pure.** No I/O, no globals, no `Date.now()`, no randomness. Same `(products, profile)` → same output, always. This is what makes recommendations explainable and debuggable.
4. **Every recommendation carries reasons.** Reasons come from `REASONS` templates in `reasons.js` — never free text, never model-generated prose. If you add a scoring signal, add its template.
5. **Tunables live in `config.js`, frozen.** `WEIGHTS`, `PENALTIES`, `THRESHOLDS`, `GOAL_PROFILES`, `DIET_EXCLUSIONS`, `CONTAINS_KEYWORDS` are all `Object.freeze`d so no caller can mutate engine behaviour at runtime. Keep new tunables frozen, and never inline a magic number in `scoringEngine.js`.
6. **The catalogs are shared with the UI and the DB.** `FOODS_LOVE`, `FOODS_AVOID`, `DIET_TYPES`, `MEALS`, `BUDGETS` are re-exported through `lib/recommendation/index.js` so onboarding, engine and `supabase/migrations/00007_user_preferences.sql` cannot drift. Change a key in one place → change all three.

---

## Non-negotiable: health data integrity

KOI's entire proposition is that a number on a card is trustworthy. This outranks every other concern in this document.

- **Never fabricate, infer, or interpolate a nutrition value.** If protein is unknown, it is unknown. Show the product without the claim, or don't show it.
- **Never derive a health claim from a proxy.** A KOI score is evidence of screening, not of protein content. Checkout used to assert *"extremely clean, high in protein, and low in added sugar"* from an average score alone, having read no macro at all — that shape is the anti-pattern.
- **`lib/data/productFetcher.js` maps columns or emits `null`.** It used to hardcode `scoreBreakdown` to `{85, 90, 95, 85}` for every product, stamp `dietary: ["Vegetarian"]` on everything, and award "High Protein" to anything whose name contained "almond". Keep it honest: a missing column is `null`, never a plausible-looking constant.
- **`components/store/product/productData.js` is the standard to follow.** Its header states the rule plainly: *"no misleading specifics — everything is derived from real fields."* Its `grade()` and `INGREDIENT_DB` degrade honestly when data is thin.
- A missing value renders as absent. It never renders as a plausible default.

---

## Writing code here

### Efficiency

- **Derive with `useMemo`, keyed precisely.** `app/store/shop/page.js` is the reference: one memo per derived view (`filteredProducts`, `categories`, `stats`, each shelf), each with an exact dependency list.
- **One pass, not many.** `filteredProducts` runs every predicate in a single `.filter()` then sorts once. Don't chain five `.filter()` calls over the same array.
- **Build lookup maps outside loops.** The KRE hoists `LOVE_BY_KEY`, `AVOID_BY_KEY`, `MEAL_BY_KEY` to module scope as `Object.fromEntries(...)`, and `productFacts.js` uses a `Set` for `contains`. Never `.find()` inside a loop over the catalogue.
- **Push `"use client"` down the tree.** 68 of 135 source files are client components — too many. A page does not need to be client just because one child is interactive. Keep data-shaping in server components; make the leaf interactive.
- **`next/image`, never `<img>`.**
- **Fetch once, render immediately.** The shop seeds from `getSeedCatalogue()` for an instant first paint, then merges live rows via `mergeCatalogue()` (live wins on id). Preserve that shape; don't introduce a spinner where a seed already renders.

### Purity and structure

- Business logic goes in `lib/`, as pure functions. Components render.
- A function that reads or writes I/O does not also compute. Keep the boundary sharp — that's why the KRE is testable and `productFetcher.js` is not.
- No function should need a comment to explain *what* it does. Comments explain *why*.

### State

| Concern | Owner | Persistence |
|---|---|---|
| Cart | `store/cartStore.js` | `localStorage` via `koi_cart`, **references only** |
| Goal profile + macro targets | `store/goalStore.js` | `localStorage` via `koi_goal_profile` |
| Location | `contexts/LocationContext.jsx` | `localStorage` + `customer_profiles` (table missing) |
| Auth | `contexts/AuthContext.jsx` | Firebase + `koi-auth-token` cookie |

- **`goalStore.js` is the persistence pattern to copy.** Start `null`, expose `hydrate()`, call it from an effect. SSR-safe, no hydration mismatch, no `setTimeout` hack.
- **Persist references, never snapshots.** The cart stores `{ id, quantity, addedAt }` and re-resolves products via `resolveFromCatalogue()`. A ₹ price written to storage last week is a stale-price bug waiting to be charged to someone.
- **Never touch a persisted store before its rehydrate runs.** `persist` writes on every state change, so a stray `setState` at module scope flushes empty state over the saved data and silently wipes it. Set flags like `hydrated` from `onRehydrateStorage`, never from module scope.
- Cart-dependent UI must wait on `hydrated`, not on a mount flag — otherwise it redirects or flashes "empty" at someone whose basket is still loading.
- Zustand stores hold state and derivations only. No fetching inside a store.
- Select narrowly: `useCartStore((s) => s.items)`, never the whole store.

### Styling

- Design tokens live in `components/store/landing/tokens.js`: `C` (palette), `HEADING`, `BODY`, `scoreColor()`. Import them.
- The codebase currently mixes tokens with inline hex (`text-[#083D2D]`). When you edit a block, move it onto `C`. Don't add new raw hex.
- Fonts are bound in `app/store/layout.js` as `--font-koi-heading` (Bricolage Grotesque) and `--font-koi-body` (Hanken Grotesk). Use the CSS vars via `HEADING`/`BODY`.
- Respect `prefers-reduced-motion` — the shop already does this globally; keep new animation inside that guard.

### Identity

KOI authenticates with **Firebase**; Supabase is configured with Firebase as a third-party auth provider, so a Firebase ID token reaches Postgres and RLS can see who is asking.

- **`auth.uid()` does not work here.** It casts the `sub` claim to `uuid`, and a Firebase UID is a 28-character string. Every policy must use **`public.koi_uid()`**, which returns the UID only when the token's issuer *and* audience match KOI's Firebase project. Without that check any Firebase project's token would satisfy your policies.
- The project id lives in one row of `koi_settings`, so pointing at a different Firebase project is an `UPDATE`, not a function rewrite.
- Policies are written **`TO public`**, not `TO authenticated`: a Firebase ID token carries no `role` claim, so Supabase runs the query as `anon`. Gate on the verified claim, never on the Postgres role.
- `getSupabaseClient()` supplies the token via `accessToken`. That disables `supabase.auth.*` — nothing uses it, and nothing should start.
- `middleware.js` is a **redirect hint, not a boundary**. It only checks the cookie exists. The boundary is RLS, plus token verification in `/api/auth/session`. Never move an authorisation decision into middleware.

### Supabase

- Only ever `getSupabaseClient()` from `lib/supabase/client.js`. It's a singleton; never call `createClient` directly.
- **`supabase/migrations/` is NOT the source of truth for what is deployed.** The live project's migration ledger is empty — the schema was applied by hand and has diverged. Only ~`00003` is live, plus a `onboarding_submissions` table in no migration. Check the real schema (Supabase MCP `list_tables`) before assuming a table or column exists.
- Every new table gets **RLS plus policies in the same migration**. See the debt note below — no live table has any.
- Migrations are append-only and named `NNNNN_description.sql`. Never edit a migration that has run.
- Never hardcode a URL or key as a fallback default. Read from the environment and fail loudly when it is missing.

### Documentation

The house style is already strong — match it exactly.

- **Every non-trivial module opens with a banner block** naming what it is, what it guarantees, and what it deliberately does not do. `recommendationService.js`, `eligibilityFilter.js` and `rankingEngine.js` are the models. Note how they document constraints ("Hard constraints only", "This stage ONLY eliminates") rather than restating the code.
- **Exported functions get JSDoc** with `@param` and `@returns`, including the shape of returned objects. See `extractFacts()` and `scoreProduct()`.
- **Document the seam, not the statement.** Explain why the strategy is injectable, why sodium stays `null` when unknown, why refined sugar is inferred rather than assumed.
- Update the banner when you change what a module guarantees. A stale contract comment is worse than none.

---

## Availability

Stock, price and delivery are claims about the world, and KOI has **no supply source wired yet**. The vocabulary is a frozen `AVAILABILITY` catalog in `lib/recommendation/config.js`, re-exported through the engine index; presentation helpers live in `lib/availability.js`.

- Three states: `available | unavailable | unknown`. **`unknown` is the default and must be constructed, never inferred.** `inStock: product.inStock !== false` is the bug shape — it turns absence of evidence into evidence of stock.
- **The absent thing is the claim, not the product.** An `unknown` product still renders; what disappears is the stock line, the delivery estimate and the live price. Hiding on `unknown` would empty the store.
- Guard every availability-flavoured string behind `canClaimAvailability(product)`.
- `candidateGenerator.js` excludes only `unavailable`. `unknown` stays a candidate — it is screened and real, just supply-unverified.

## Known debt — read before you build on it

1. **Checkout is entirely mocked.** `app/store/checkout/page.js` has a hardcoded `MOCK_ADDRESS`, four decorative payment options, and `setTimeout(800)` → `/store/orders`. No payment, no order write. Nothing here is a foundation. Note KOI is not merchant of record, so `orders.payment_status` is a fact it cannot observe — storefront checkout needs its own `fulfilment_intents`, not the brand-side `orders` table.
2. **Seven tables still have RLS disabled**: `products`, `skus`, `sku_nutrition`, `screening_reports`, `brands`, `uploads`, `onboarding_submissions`. The storefront reads the first five (three as embedded selects) and the brand dashboard writes the rest **from the browser on the anon key**, so enabling RLS needs the Firebase third-party provider live *and* brand identity fixed, or the brand module loses its write path. Everything else is closed.
3. **Two prerequisites before the customer tier works at all.** `koi_settings.firebase_project_id` still holds the sentinel `REPLACE_ME_FIREBASE_PROJECT_ID`, and the Supabase dashboard needs Authentication → Sign In / Providers → Third Party Auth → Firebase enabled. Until both are done `koi_uid()` returns NULL and every customer policy denies — the safe direction to fail, but nothing will save.
4. **The anon key is unrotated** and still in git history, though no longer in the working tree.
5. **Brand identity is still broken.** `brands.owner_id`, `screening_reports.reviewed_by`, `uploads.uploaded_by` and `audit_logs.changed_by` all reference `auth.users(id)`, which has no KOI users. That is why the catalogue tables above cannot get RLS yet.
6. **The landing page still publishes fixture scores.** `tokens.js` `PRODUCTS` renders hand-written KOI scores for real third-party brands on `/store`. The shop is gated to non-production via `getSeedCatalogue()`; the landing page is not, because `HeroEditorial` and `ProductSections` are composed around a guaranteed product and need a designed no-catalogue state.
7. **`AuthContext.jsx` has unreachable code** — a second `return` after `return () => clearTimeout(t)`. `/api/auth/session` also does not verify the Firebase token: it writes whatever string the client POSTs into the cookie `middleware.js` trusts.
8. **`middleware` is deprecated in Next 16** — the build warns to migrate to `proxy`.
9. **`eslint_report.json` is stale.** It records 53 errors; a live `npm run lint` reports **0 errors, 2 warnings**. Trust the command, not the file.
10. **`PENALTIES.lowStock` is dead** — `extractFacts` never sets `facts.lowStock`, so the penalty in `scoringEngine.js` can't fire.

---

## Definition of done

- `npm run build` passes; `npm run lint` introduces no new errors.
- No fabricated nutrition value, health claim, or score anywhere in the diff.
- New logic is pure and lives in `lib/`; components only render.
- Derived values are memoised with exact dependencies; no repeated passes over the catalogue.
- New modules carry a banner; exported functions carry JSDoc.
- New tables ship with RLS and policies in the same migration.
- Changes to shared catalogs are applied in all three places: engine config, UI, migration.
- You read the relevant `node_modules/next/dist/docs/` page before using a Next.js 16 API.
