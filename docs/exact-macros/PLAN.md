# Exact macros, meals out, Calendar & auto-plan: implementation plan

## Context
The founder approved the v2 canvas (https://claude.ai/artifact/T8Ub8NEAyBMuZ7iauPUqsF). It has eight boards:
- **You:** your own numbers.
- **Plan:** a week portioned to the gram, with batch boxes.
- **Recipe page and Cook mode.**
- **Track · Today**, with "I ate something else" handled as a Take 2.
- **Calendar.**
- **Auto-plan sheet.**

They asked to start building on a new branch, and whether more than frontend is needed. **Yes, most of the work is engine and data.** The explorers found:
- **Targets:** `household_member` already has `target_carbs_g` / `target_fat_g` (00044:59-62) and the solver already reads all four macros (`candidates.js:198-201`, soft goals in `model.js:842-891`). But `lib/household/profile.js` never writes carbs or fat, and `requestBody.js:63-68` drops them. There is no fat ceiling.
- **Quantities:** the solver's decision variables are **packs**, never grams (`model.js:806-839`). `schedule.js` "never changes a quantity", and `recipe_line` has **no quantity, by design** (00068:16-19, :102). Dishes have **no method steps**.
- **Nutrition:** it exists **per SKU only** (`sku_nutrition`). Ingredients and dishes have none.
- **Meals and cooking:** there is no meal log, calendar, user scheduler, notifications (OTP is Supabase Auth; ops alerts go to a webhook) or service worker. Batch cooking doesn't exist.
- **Bug:** `usePlanSession.resetToSuggestion` writes `target_source:"suggested"`, which is not an allowed value (00050:76-79).
- **Blocker:** Supabase KOI-PLATFORM still returns 402 `exceed_storage_size_quota` (checked today). Pure engine modules and tests can be built and run offline. Live evals, the UI walk and the store data need the block lifted. Migrations through the Supabase MCP worked during the block on 21 Oct.

## Decisions (user, 23 Oct)
- **Build offline until Supabase resets.**
  - Write migrations as files. Apply them through the Supabase MCP only if the management API accepts them, then verify with SQL; if not, queue them in `docs/exact-macros/PLAN.md`.
  - Live `evalPlanner`, agent evals and the browser walk wait for the reset. Each phase's build log records what is still unverified live.
- **Notifications: in-app only for now; WhatsApp Cloud API later.**
  - Build a channel-agnostic `notification` table plus a `lib/notify/dispatch.js` with an `inApp` adapter.
  - Design for WhatsApp now:
    - a template name and params on each notification kind;
    - a per-person opt-in record (`notify_consent`: channel, opted_in_at, source), as WhatsApp requires;
    - the phone comes from the auth identity;
    - a `channels` array on jobs.
  - The adapter itself is a later, small addition.
- **Track holds meals too:** adults only, account holder only, kept until deleted. Extend `/store/profile/data` deletion to `member_meal_log`.
- **I write the recipes, as the seed of the future foods / meals / recipes database.** The schema is generic and keyed to the existing ingredient graph:
  - nutrition hangs off `food.ingredients_master`;
  - allergens and diet flags stay derived through `lib/food/dishes.js`;
  - aliases in `ingredients_master` help parse meals out;
  - every recipe row carries `source` / `version`;
  - eaten-out dishes are ordinary dishes with a `context` (home / canteen / restaurant), not a separate list.

## Branch & setup
- `git worktree add .claude/worktrees/exact-macros -b exact-macros main` (from **local** main 85325da; origin/main is 30 behind), then `EnterWorktree(path)`. Copy `web/.env.local`, run `npm install`, dev server on port 3114.
- `docs/exact-macros/PLAN.md` (this plan plus a build log), and the canvas source copied to `docs/exact-macros/canvas/`.
- Conventions:
  - Tailwind `koi-*` tokens and GSAP (no inline styles or CSS animation, per memory).
  - `node --test` files next to the source.
  - Every figure comes from an engine, never the model.
  - Plan changes are offered as a Take 2, never applied unasked.

## Phases (each one ships with tests; nothing is de-scoped, only sequenced)

### P1 · Food data foundation (the heaviest part)
Migration **00087**:
- `food.ingredient_nutrition` (ingredient_id, per-100 g kcal/protein/carbs/fat/fibre, `source='ifct_2017'`, `source_ref` = IFCT code, `fridge_days`, `cooked_yield`).
- `food.kitchen_measure` (ingredient or category, unit cup/tbsp/tsp/piece, grams).

Migration **00088**:
- `recipe_line.grams_per_serving`.
- `food.recipe_step` (dish_key, position, title, text, minutes, timer_s, uses).
- `food.dish` gains `keeps_days`, `batchable`, `eaten_out` (flag).
- The 00068 comment is updated: base-serving grams are editorial, and the engine scales them.

Content:
- Reviewed JSON sources in `web/src/lib/food/recipes/*.json`, covering the ~146 dishes plus ~40 common eaten-out dishes (biryani, dosa, thali, butter chicken…).
- A generator `web/scripts/buildRecipes.mjs` writes the seed migrations and regenerates `dishData.js`, extending `buildDishes.mjs`.
- Nutrition: IFCT 2017 values. Check whether the digitised `ifct2017` dataset/npm package can be used and what its licence allows; if not, enter them by hand from the tables.

Modules:
- `lib/food/nutrition.js`: dish macros from lines. A shelf line uses the basket SKU's label per 100 g, falling back to IFCT.
- `lib/food/measures.js`: grams to "½ cup / 1½ tbsp / 2 large".

Tests: every line has grams; each slot's base serving falls in plausible ranges; measures round-trip.

### P2 · Exact macros (targets)
- `profile.js` (`blankProfile` / `profileFromRow` / `memberPayload`) carries carbs and fat.
- `save.js` `withSuggestedTargets` keeps all four when stated.
- Fix `resetToSuggestion`.
- `requestBody.js` and `plan.js:134-137` accept carbs and fat overrides.
- `model.js`: when targets are stated, add hard bands at ±tolerance for kcal, protein, carbs and fat (new `target_tolerance_pct`, `carb_cycling` on the member). The existing relax ladder in `solvePlan.js` stays as the fallback, and the report says which bands were relaxed.
- `goals.js` keeps suggesting kcal and protein only.
- UI: in `YouStep.jsx` Baseline, a "KOI's suggestion | My own numbers" switch, four inputs, the 4/4/9 check, "Fit carbs", training days and tolerance.

### P3 · Portions in grams
- `lib/plan/portions.js`: for each member and day, take the dishes from `buildWeek`. Solve one scale per (dish, member) within [0.6, 1.8], plus "flex" lines (rice/roti/oil/whey), to land inside the bands. It reuses the HiGHS wrapper in `lp.js` / `solve.js`.
- Round to kitchen steps, then re-check.
- `lib/plan/reconcile.js` turns the grams back into shelf packs and a fresh list. The cart diff goes through `lib/cart/plan.js`.
- `WeekGrid.jsx`: grams per cell, a "Your day" row with worst deviation, and grams on `TodayPlates`.
- Engine order stays **basket LP → buildWeek → portions → reconcile**, so the existing planner and households are unchanged when nobody has their own numbers.

### P4 · Batch cooking, the recipe page, Cook mode
- Household `cooking_style` (fresh / batch / batch_lunch), set in "This week's brief".
- `lib/plan/batch.js` groups slots into batches within `keeps_days` and cooks them on prep days (from the Calendar once P6 lands, Sun/Wed by default).
- Portions share one scale per batch, so every box is the same.
- Cell `batch {id, box, of}` → chips and batch cards.
- Route `app/store/plan/dish/[key]/page.js` with `components/store/recipe/*`:
  - servings 1 / n and cups or grams;
  - grouped checklist (KOI order / fresh / kitchen);
  - steps with the amounts each uses;
  - the split-into-boxes step from the yield;
  - nutrition per box.
- `CookMode` as a full-screen overlay with Wake Lock and timers.

### P5 · Today, meals out, Take 2
Migration **00089**:
- `member_meal_log` (member, eaten_on, slot, planned ref, status ate / skipped / other / partial, other {dish_key | text, setting, portion}, estimate {kcal, p, c, f, low, high, basis}). RLS copies `member_checkin` (00077: account holder, adult).
- `plan_week.adjustments` (jsonb, undoable).

Modules:
- `lib/food/estimate.js`: dish × portion × setting factor (home / canteen / restaurant oil and portion) → a range.
- `lib/plan/rebalance.js`, the Take 2 options:
  - the skipped meal by kind: a box moves before its use-by or is frozen; a fresh dish moves or goes to next week; a shared dish becomes leftovers; packaged food just stays;
  - small gap: fix today using only food on hand;
  - big gap: spread over the remaining days, with a per-day cap and `kcalFloor`;
  - "leave it" is always offered.

Routes: `/api/track/meal` (log and today) and `/api/track/rebalance` (preview / apply / undo).

UI in `TrackView`:
- a Today card (Ate it / Something else);
- an off-plan Sheet (one portion question, the estimate card, the Take 2);
- a week strip.

KOI:
- agent tool `log_meal` (approval card kind `meal`) plus `ask_shopper` for the portion;
- eval cases;
- `KoiBar` sends "ate / had / khaya…" sentences to Track (rules, with the interpreter model when it is set).

Later in P5: the pattern suggestion ("plan Tuesday lunch as out").

### P6 · Calendar
Migration **00090**:
- `calendar_event` (household, member?, kind plan / auto / shop / prep / remind / out / training / travel, starts_at, ends_at, all_day, weekly `rrule`, `plan_effect` jsonb, source user | koi). RLS through the household owner (`koi_uid()`).

The planner reads it:
- `out` removes that slot (per day, like `meals_from_home`) and leaves room for a kcal allowance;
- `training` drives carb cycling;
- `prep` sets the batch days;
- `travel` means no batch.

Also:
- `/store/calendar`, with "Calendar" added to `StoreHeader` NAV;
- `/api/calendar` (CRUD) and an ICS export;
- agent tool `schedule` (approval).

### P7 · Auto-plan & notifications
Migration **00091**:
- `autoplan_job` (household, weekday, local_time, tz, rules, channels, paused, next_run_at);
- `notification` (in-app inbox);
- `plan.status` gains `draft` if it's missing.

Cron: `vercel.json` hourly → `/api/engine/autoplan` (`cronSecret.js`). It uses the service role, drafts with `planForHousehold`, and writes a notification. The cart fills only when you approve; there is never a checkout.

UI: the AutoPlan sheet (`components/store/system/Sheet.jsx`) and a header inbox badge. External channels follow the decision below.

## Verification
- `npm test` (new unit tests per module), eslint, `next build`.
- `scripts/evalPlanner.mjs` with new exact-macros households. Property: every day is within tolerance on all four macros, and households without their own numbers are unchanged.
- `scripts/evalAgentLoop.mjs` with `log_meal` / `schedule` cases.
- Migrations: written as files first, applied with the Supabase MCP, then verified with SQL.
- Playwright walk at 1440 and 390 (the MCP is available now) on port 3114. It needs the 402 lifted and a signed-in OTP from the user.
- Commit per phase on `exact-macros`, push, and tell the user how to see it (`git checkout exact-macros`, `npm install`).

## How the food data is regenerated
1. `npm pack @ifct2017/compositions@2.0.9` into an empty scratch folder, then untar it. That version is MIT. Versions after 18 Apr 2025 are AGPL; never use them.
2. `python -I web/scripts/ifctExtract.py <package>/index.csv <scratch>/ifct.json` extracts the macro columns only.
3. `python -I web/scripts/foodsResolve.py <scratch>/ifct.json web/scripts/foods.source.json web/src/lib/food/foodData.js`.
4. From `web/`, `node --import ./scripts/testAlias.mjs scripts/buildRecipes.mjs` rewrites 00087/00088. `--check` fails if they are stale.
5. To review a batch the way a cook reads it: `node --import ./scripts/testAlias.mjs scripts/previewRecipes.mjs <dish…> [--scale 4] [--grams]`.

## Build log
### 23 Oct · P1 food data
- Branch `exact-macros`, from local main 85325da.
- `lib/food/foodData.js` has 141 food items:
  - 100 from IFCT 2017, with their codes;
  - the rest cited: USDA FDC, ICMR NVIF 1989, or `koi_estimate` for typical labels (soya chunks, toned milk, masalas, sev, pav, makhana, noodles, sattu, cream, amchur).
- `lib/food/{foods,measures,recipes}.js` and `recipes/*.js` cover all 146 dishes. Each has grams per adult serving, plated weight, fridge life, a batchable flag and a 2–6 step method: 974 lines and 439 steps in all.
- Step amounts are templates (`{n}`, `{water:g[:adjective]}`), so a method rescales and switches between cups and grams.
- Tests: `recipes.test.js` has 11 tests:
  - coverage, line alignment, and shelf/food agreement;
  - kcal bands per kind, and 4/4/9 consistency;
  - every line used in the method;
  - measure wording.
  - The full suite is 615/615.
- Migrations **00087_food_items** and **00088_recipe_quantities** are written (generated) but **not applied**.
  - On 23 Oct the Supabase management API returned "You do not have permission" (the project is restricted over the storage quota).
  - Apply both, in order, once the block lifts. 00088 raises an error if the database's dish lines have drifted from `dishData.js`.
- Notes:
  - IFCT's paneer (14.8 g fat) and chicken breast (9 g fat) run fattier than packaged products. Shelf lines use the product label whenever the basket has one.
  - Eaten-out dishes (canteen biryani and so on) come in P5.

### 23 Oct · P2 your own numbers
- `profile.js` carries `target_carbs_g`, `target_fat_g`, `target_tolerance_pct` (2–15, default 5) and `carb_cycling` (adults only). New helpers: `hasExactMacros` and `toleranceOf`.
- `save.js`:
  - `withSuggestedTargets` keeps all four numbers when any is stated. Going back to KOI's suggestion clears carbs, fat and carb cycling, since KOI suggests only kcal and protein.
  - `applyProfileSet` (used by the agent) accepts carbs, fat and tolerance.
- `projection.js` adds:
  - `dailyFigures` with `carbs`, `fat` and `macrosStated`;
  - `macroCheck` (4/4/9, within 1% or 25 kcal, plus the carbs that would make it add up);
  - `carbCycle` (training days get 20% more carbs, rest days fewer, the same week in total).
- One-plan overrides accept carbs and fat (`requestBody.js`, `plan.js`).
- UI: `OwnNumbers.jsx` sits in YouStep's Baseline card behind a "KOI's suggestion | My own numbers" switch. It has the four inputs, the add-up check with "Fit carbs to the calories", g per kg, more carbs on training days, and ±3/5/10%. The first switch pre-fills KOI's kcal and protein, with fat at 25% of calories and carbs taking the rest.
- Migration **00089_member_macro_targets** adds the two columns and restates `save_household_member` with them, derived from 00067's text. **Not applied**; the database is blocked.
- **Deviation from the plan, and why:**
  - **No hard ±tolerance bands in the basket solver.** The solver buys KOI shelf packs only, but a day's food also includes fresh chicken, eggs and vegetables from elsewhere. Hard bands on the basket would be infeasible or wrong. The four-number guarantee moves to the portion engine (P3), which sizes every line of every dish.
  - The explorer's `resetToSuggestion` "bug" is not one: `"suggested"` is a sentinel that `withSuggestedTargets` always resolves (`save.js:35`).
- Verified: `macros.test.js` (8), the suite, eslint and `next build`. Not verified live: the You step with a signed-in household (the database is blocked).
