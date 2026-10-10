# KOI: one shell, one cart, one checkout (design brief)

**Canvas:** https://claude.ai/artifact/ETg6GbJPP5XyRCFV2wmjEA
**Research:** `docs/unified-shell/research.md`
**Today's screens:** `docs/unified-shell/screens/*.png`, plus `docs/agent-mode/screens/*` for the signed-in Plan and the founder's design.

**What this changes:** KOI looks like three products glued together. There are three palettes, five headers, two carts, and a Plan page that never reaches checkout. This brief makes it one: one header, one cart, one checkout.

**The look stays:** the Plan page's look (the founder's design) becomes KOI's in-app language everywhere.

---

## 1. Decisions (10 Oct 2026, the user's)

1. **One in-app language, from the Plan.**
   - It is: off-white ground, white hairline cards, `#1f5c3a` green, ₹ in Space Grotesk, and Plex Mono labels.
   - It applies to the shop grid, product, cart, checkout, orders, profile and household.
   - The landing page and the shop hero keep their forest-and-lime editorial headline, but share the header, tokens and fonts.
2. **The Plan's Shop step becomes the real cart.**
   - Pantry ends with **"Put this week in my cart"**.
   - The step is labelled **Cart**. It shows the one cart, then goes to **Checkout**.
   - **Track** follows the order.
3. **A changed plan is offered, never applied.** The banner reads "Your plan changed: 2 added, 1 removed · Update cart", and nothing moves without a tap. Adding the plan twice never doubles it.
4. **Design first.** Code starts only after the user signs off on this canvas.

## 2. Tokens: one source (`components/store/system/tokens.js` + `app/store/koi.css`)

| Role | Token | Value | Use |
|---|---|---|---|
| Ground | `bg` | `#f6f5f1` | every in-app page |
| Surface | `surface` / `surface2` / `quiet` | `#ffffff` / `#faf9f6` / `#f4f3ee` | cards / tiles / wells |
| Hairlines | `line` / `line2` / `divider` | `rgba(20,22,15,.07)` / `rgba(20,22,15,.12)` / `#f0eee7` | borders, rules |
| Ink | `ink` / `ink2` / `muted` | `#1c1e17` / `#6b6f63` / `#8c8c84` | text. `muted` only at 14 px bold or larger, or for decoration; small text uses `ink2` |
| Green | `primary` / `accent` / `deep` | `#1f5c3a` / `#2f8050` / `#0f3d2e` | CTAs, active states, KOI-speaks panels |
| Mint | `mint` / `tint` / `tintBorder` | `#9fe7c4` / `#e8f1ea` / `#cfe3d6` | on-deep text, selected wells |
| Warm | `warm` / `warmTint` / `logoDot` | `#c2683a` / `#faece2` / `#e8743b` | "needs you", plan-changed, the logo dot |
| Status | red / warn / blue | `#b84535` on `#fdf0ee` · `#856404` on `#fff3cd` · `#1a5276` on `#e8f0fb` | errors, cautions, info |
| Editorial only | `forest` / `lime` | `#083D2D` / `#DDF247` | the landing hero, the shop hero, the cart-count badge |

**Retired:**
- the sage app shell (`#F2F6EC`, `#E2E8D8`, `#0E4032`, `#5A6B5A`);
- the second lime (`#C8F23E`);
- body text in Hanken Grotesk;
- the purple shadcn theme on store pages. The supplier dashboard keeps it.

**Type:**

| Font | Weights | Where |
|---|---|---|
| Plus Jakarta Sans | 400–800 | all UI text. Headings are 700/800 with −0.02em tracking |
| Space Grotesk | 500–700 | **every figure**: ₹, packs, kcal, counts |
| IBM Plex Mono | 500 | 10–11 px uppercase labels, +0.12em tracking |
| Bricolage Grotesque | 800 | **display only**: the wordmark, the landing hero, the shop hero |

**Shape and depth:**
- Radii: cards 22, tiles and plates 14–16, controls 12, pills 999. The phone sheet's top corners are 28.
- Elevation: hairline only by default.
  - `e1`: `0 1px 3px rgba(20,22,15,.07)`
  - sheet: `0 24px 60px -20px rgba(15,61,46,.35)`
  - toast: `0 12px 32px rgba(0,0,0,.18)`

**Motion:**
- `koiUp`, `koiPop` and `koiPulse` (from `plan.css`) cover every entrance.
- Sheets slide 260 ms on `cubic-bezier(.2,.8,.2,1)`.
- Under `prefers-reduced-motion`, all of it is off.

## 3. Components (exact names, so they carry into code)

| Component | What it is | States |
|---|---|---|
| **StoreHeader** | the one header | `app` (blurred off-white, hairline); `editorial` (transparent over the forest hero, white text, lime cart; turns `app` after 24 px of scroll); `focused` (checkout: wordmark, Cart › Checkout › Hand-off, "Back to cart"). Shopper signed in or out; cart empty or N |
| **PlanBar** | the Plan's steps and household, sticky under StoreHeader | step done ✓, current, upcoming, locked. Household avatars, "+ Add". On phones the steps scroll and the household is behind a button |
| **MobileTabBar** | Home · Shop · Plan · Cart · You | active tab; cart badge in lime with a figure; hidden on checkout |
| **Wordmark** | "KOI" in Bricolage 800 with the orange dot | on light, on forest |
| **Button** | primary (green), secondary (white + hairline), ghost, on-deep (mint) | rest, hover, pressed, busy ("Adding…"), disabled |
| **Pill** | filter or toggle chip | off, on, with a count |
| **QtyStepper** | − n + | 1 (the − becomes remove), n, at max, busy |
| **Money** | ₹ in Space Grotesk | value; **null renders nothing**; "MRP" suffix when shown alone |
| **MonoLabel** | an uppercase Plex Mono eyebrow | — |
| **ProductThumb** | a cream plate with the pack shot | image; no image (a leaf, never a fake photo) |
| **Card** | white, 22 radius, hairline | plain, selected (2 px green), deep (KOI speaks) |
| **AddedToast** | the add confirmation | desktop: drops from the cart button. Phone: above the tab bar. Shows thumb, name, pack, "2 in cart", **View cart** and **Checkout** |
| **CartSheet** | a right drawer on desktop (440 px) and a bottom sheet on phones | empty; shop-only; plan-only; mixed; plan changed |
| **CartView** | one cart, three places: the sheet, `/store/cart`, the Plan's Cart step | groups **This week's plan · for N** and **Also in your cart**; the summary |
| **PlanGroup** | the plan's lines inside CartView | in sync; changed (banner); a line edited by the shopper ("Plan: 5"); a line marked have-at-home (hidden, with "2 at home" in the footer) |
| **PlanChangedBanner** | warm tint | "Your plan changed since you added it · 2 added, 1 removed" plus **Update cart** and **See what changed**. After a tap: "Cart updated · Undo" |
| **CartSummary** | the rail on desktop, a sticky bar on phones | item count, MRP total, the Swiggy note, **Checkout →**; phone "₹3,553 · 10 items · Checkout" |
| **CheckoutSteps** | Deliver to · Swiggy · Review hand-off | each pending, active, done, or error |
| **OrderCard** | one hand-off | draft ("Finish this basket →"), handed off, delivered; "Week plan · Track →" when it came from a plan; "Build this basket again" |

## 4. Copy rules (non-negotiable, as everywhere in KOI)

- **Figures come only from data:** ₹ from catalogue MRP, packs from the planner. In this canvas, every figure is marked as a sample.
- **No delivery-fee, stock or ETA claim.** KOI has no supply source wired. The cart and checkout say once: *"MRP from KOI's catalogue. Swiggy shows the final price, fees and delivery before you pay."*
- **No health words:** healthy, superfood, cures, boosts. Safety wording stays "Not for {person}: contains {allergen}".
- **Plain verbs on buttons:** "Put this week in my cart", "Update cart", "Checkout", "Send to Swiggy". Sentence case, no exclamation marks.
- **People** are named by household label: Me, Wife, Kid 2.

## 5. Flows

**A. Golden path, from the Plan**
1. Plan.
2. Pantry: tick "Have it" on what's at home, then **Put this week in my cart**. Cart gets `applyPlan`, which replaces the plan's share and never adds to it.
3. **Cart** step: the plan group plus "Also in your cart". **Checkout**.
4. Checkout (`focused` header): deliver to, connect Swiggy, review the hand-off, **Send to Swiggy**.
5. Orders: "Handed off" card with "Week plan · Track →".
6. Track.

**B. From the shop**
1. The shop grid: **Add** opens AddedToast.
2. **View cart** opens CartSheet.
3. **Checkout**.

**C. The plan changes after it was added** (by the dock, a swap, or editing a person)
1. Every CartView shows PlanChangedBanner.
2. **Update cart** shows "Cart updated · Undo".

**Rules the canvas settled (they bind the build)**
- **After a hand-off, only the lines Swiggy accepted leave the cart.** "Not going" lines stay, so nothing is lost.
- **"See what changed" lists every line:** + added, − removed, ~ pack count changed. It offers **Keep my cart** or **Update cart**, and after either, Undo.
- **A plan line can go above the plan's count.** The extra is the shopper's own: at 7 with "plan said 5", a later update replaces only the 5.
- **The Cart step reached before Pantry's button** shows one deep card, "Not in your cart yet", with **Put this week in my cart**.

**D. Signed out**
- The cart works signed out.
- Checkout asks for the phone OTP: LoginSheet, unchanged.
- The Plan's signed-out state sits **inside** the shell (the header and the tab bar stay). It has one clear card and the sign-in button.

## 6. Phone stacking (the bug today)

There is one bottom stack, measured by `--koi-bottom-chrome`:

| Layer | What sits there |
|---|---|
| 1 | MobileTabBar, 16 px from the edges |
| 2 (on cart surfaces) | CartSummary bar, with the agent dock reduced to a 52 px round **K** button at the bar's left |
| 2 (everywhere else) | the dock pill |

Nothing else floats. `MiniCart` and the cart page's floating checkout card are removed.

## 7. Out of scope

- Payment: KOI never takes it; Swiggy does.
- The Plan's other steps: Define, You, Plan, Pantry and Track keep their content and only move under StoreHeader and PlanBar.
- The agent dock's design. It keeps its glass and moves to the shared stacking.
