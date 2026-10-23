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

### 23 Oct · P3 portions in grams
- `lib/plan/portions.js` sizes a person's week. It is a pure box-constrained least squares solved by coordinate descent, so it runs in the browser. HiGHS is server-only.
  - **Sized by component**, the way a lifter cooks. Each plate's protein, carb, fat and rest lines get their own scale (`ROLE_BOUNDS`; oil can halve but never vanish). Scaling the whole dish carried oil up with the protein, and fat ran 6–17% over.
  - The tie-break penalties (`couple`, `stay`) sit an order of magnitude below a 5% miss, so they never buy a miss.
  - Bulk lines go in 5 g steps. Quarter cups of rice are too coarse at 46 g, about 160 kcal. Small lines snap to spoons. Each day is re-checked from the rounded grams.
  - A day that misses names the miss ("short 30 g carbs").
  - Results: a protein-forward lifter week with whey lands **7/7 days within 5%** (worst 4.6%). An ordinary home week honestly reports short protein.
- `schedule.js`:
  - `macroNeeds` leans the menu protein-dense for whoever has their own numbers only, scored by `proteinDensity` from the recipes. Other households' weeks are unchanged (test).
  - `supplierOf` names the basket product for a shelf line, so it is sized from that product's label.
- `lib/plan/reconcile.js` takes the sized week and gives:
  - shelf grams against the person's share, with short items as "+N packs";
  - a fresh list by weight or count.
- UI:
  - `usePlanSession` computes `portions`. Training days default to Mon/Tue/Thu/Fri until the Calendar (P6).
  - WeekGrid shows the plate in grams and kcal·P per cell, sized additions, a "Your day" row with within-N% or the miss, and a banner.
  - PantryStep has "For your sized week": shortfalls with an "Add N packs" offer, and the fresh list.
- **Data-loss bugs found and fixed:**
  - Every member read that leads to a save now selects `*`: the Plan session, the household page, the agent's `loadContext` and `syncAccountMember`. `memberPayload` sends every field, so a read that skipped carbs or fat would have saved them as nothing.
  - **Pre-existing:** `syncAccountMember` never read `favourite_categories`, `target_weight_kg` or `spice_tolerance`, so every goal-setup sync wiped them.
  - Reading `*` also keeps the query valid before and after 00089.
- Tests: `portions.test.js` (10), `reconcile.test.js` (2), and 2 new in `schedule.test.js`. Suite 637/637; eslint and `next build` pass. Not verified live: the week with a signed-in household.

### 23 Oct · P4 batch cooking, the recipe page, Cook mode
- `lib/plan/batch.js` (`planBatches`):
  - Groups a meal slot into batches cooked on prep days, Sun/Wed by default until the Calendar (P6).
  - A batch covers the day after one prep day up to and including the next, capped by the dish's `keeps` days and `MAX_BOXES` (4).
  - Cooking styles are `fresh`, `batch` (lunch and dinner) and `batch_lunch`.
  - Returns:
    - the batches;
    - the menu overrides that put one dish in every box (`schedule.js` marks them `cell.shared.batch`);
    - `ties(memberId)`, so the portion engine gives a person the same grams in every box of a batch.
- `usePlanSession` builds the week in two passes:
  1. the menu;
  2. batches over it, then the menu again with the batch overrides under the shopper's own picks.
  It also reads and saves `household.cooking_style` / `prep_days`.
- Migration **00090_household_cooking** adds those two columns. **Not applied**; the database is blocked.
- UI:
  - The brief has "How you cook" (Fresh / Batch / Batch lunches only) and "Cook on" weekday chips.
  - WeekGrid shows a "Batch A · 2/3" chip per box and a batch card per cook linking to its recipe. The swap menu opens with "Recipe".
- `lib/food/cookPlan.js` decides what is being cooked: a batch (every person × every box), one meal (the plates at that table) or plain servings.
  - The pot is the sum of the plates line by line: a sized plate is more chicken, not more oil. So the method's amounts are the real totals.
  - The split says who gets which boxes and roughly what each weighs.
- `/store/plan/dish/[key]` (`RecipeView`):
  - fact tiles;
  - servings and cups-or-grams switches;
  - a checklist grouped by where things come from (your KOI order / fresh / your kitchen);
  - steps with their amounts and times;
  - the split card and nutrition per plate.
  Signed out, or with no plan, it is a plain recipe (`?batch=` falls back).
- **Cook mode** (`CookMode.jsx`) is full screen, one step at a time, with Wake Lock, keys and the step's amounts. It sits at z-125, above KOI's ember (120).
  - **Timers are the cook's to start (user, 23 Oct).** Nothing starts on its own:
    - a step the recipe times offers its time, ±1 min before starting; any other step has "Set a timer for this step";
    - started timers count to an end time, so a slept tab comes back right;
    - they keep running in a strip when you move on, and tapping one goes back to its step;
    - time's up turns it lime, vibrates where it can, and is read out;
    - leaving with a timer set asks first.
- Fixed while checking: the grams column repeated amounts already in grams ("150 g … 150 g").
- Verified:
  - `batch.test.js` (6), `cookPlan.test.js` (4), the suite (647/647), eslint and `next build`;
  - Playwright at 390 and 1440: the recipe page, cook mode, and timers through time's up (with a fake clock).
- Not verified live: batch weeks and the batch/cell recipe links with a signed-in household (the database is blocked; the unit tests cover the cook plan).

### 23 Oct · P5 Today, meals out, Take 2
- **Food data:**
  - 7 new foods: khoya (IFCT L004); cheese, ice cream, ketchup and pasta (USDA FDC, carbs as available carbohydrate); mayonnaise and cola (labelled KOI estimates). That makes 148; 00087 regenerated.
  - `recipes/eatenOut.js` holds **38 eaten-out dishes**, written as the place makes them (a stall samosa carries its frying), unit `plate` or `piece`. A home dish eaten out (biryani, dosa) is the home recipe with the setting's factors; it isn't repeated.
- `lib/food/estimate.js`:
  - `estimateMeal({items, setting, slot})` returns point, low and high, plus the basis.
  - Fat lines (oil, ghee, butter, cream, nuts) and the serving are scaled by `SETTINGS`: home ×1/×1 (±15%), canteen ×1.5/×1.1 (±25%), restaurant ×2/×1.3 (±30%), street ×1.5/×1 (±30%). Each dish is scaled relative to where it's usually made.
  - One portion question: small 0.7 / usual / big 1.4 / seconds 1.9, or a count for pieces.
  - A meal KOI can't name is a typical meal of that slot, ±40%, and the basis asks for the dish.
  - `matchDishes` reads dishes and counts from a sentence. A word that fits several dishes ("biryani", "pizza") is **one mention with options, never a guess**.
  - Sample estimates: restaurant chicken biryani ≈ 1,060 kcal (740–1,380) against 710 at home; chole bhature ≈ 890; a canteen veg thali ≈ 1,010.
- `lib/food/mealWords.js` (`readMealSentence`, `mealFromConversation`):
  - English and Hinglish: "kal raat bahar pizza khaya, full plate" is yesterday's dinner, at a restaurant, a big plate, pizza to choose.
  - Also skipped and half-eaten meals.
  - The KOI bar, the agent (model or rules) and Track's sheet all read sentences this way.
- `lib/plan/today.js`: `platesOfDay` gives the person's plate per meal (sized grams, or the recipe's serving, plus additions and swaps). `dayLedger` gives eaten so far, the day as it's going, and the gap.
- `lib/plan/rebalance.js`, the Take 2, which offers and never applies:
  - **The numbers:**
    - leave (always);
    - today: resize the meals still to come (the portion engine for exact macros, a plate scale within 0.6–1.3 otherwise);
    - spread: later days, each by at most 10% and 300 kcal, never under the floor; what doesn't fit is said.
    - Protein is never cut: a protein-rich meal out raises that day's protein so later meals keep theirs.
  - **The uneaten meal**, by kind:
    - box: to a later meal before its use-by, or freeze it;
    - leftovers: a shared dish that keeps, packed for a later meal;
    - fresh: cook it on a later day (that day's dish moves to next week), or next week;
    - keeps: nothing to move.
  - `applyAdjustments` re-derives the week. Resized days use `sizePortions`' new `fixed` (logged meals, cooked boxes, swapped plates) and `shift` options.
- **Measured against the plan, not the target, for people not on their own numbers** (found building it). Their plates are recipe servings, not sized to them, so judging the day by their target would call every planned day "800 under". The gap is what the meal changed; their target only guards the floor.
- Migration **00091_member_meal_log**:
  - `member_meal_log`: one row per meal, status `ate | partial | skipped | other`, `other` + `estimate`, and `source` `track | koi | whatsapp`. RLS copies 00077: account holder only, adults only.
  - `plan_week.adjustments`, and `food.dish.context`.
  - **Not applied** (database blocked).
- **The week is anchored to the day it was planned** (`restore.weekStart`, `buildWeek({today})`). It used to start "today" on every load, so a pick saved for Wednesday's dinner slid a day each day, which was a pre-existing bug. Track needs real dates, so it's fixed here.
- **Session (`usePlanSession`):**
  - The account holder's meal log comes through `useMealLog`. It's offline-first: an entry the database can't take is kept on the device, marked pending, and sent on the next load.
  - Adjusted portions; `takeTwoFor`, `applyTakeTwo`, `undoAdjustment`.
  - Adjustments are saved on `plan_week` with a local copy until 00091 runs.
  - A dish moved by a Take 2 pins the week's other meals as `kept` picks (KOI's, not shown as "Your pick"; batch boxes are left to batch.js). Without that, the scheduler re-chose the later meals and the displaced dish came straight back, which the browser walk caught.
- **UI:**
  - The Track page gets a week strip (a dot per meal, the day's delta) and a Today card: plates, "Ate it" and "Something else", the bar, Take 2s with Undo, and "Moved to next week / In your freezer".
  - `MealOutSheet`: dish search, the portion question, where, the estimate card, the two Take 2 choices with KOI's suggestion, and "Log it and apply".
  - `/store/track?meal=…` (from the KOI bar) and `?take2=date:slot` (after KOI's agent logs) open the sheet prefilled.
  - Track has its own layout: opened directly, it had no page padding (pre-existing).
  - `/store/profile/data` has a Meals section that deletes the database rows and this device's held copy. It reads leniently before 00091.
- **KOI:**
  - Agent tool `log_meal` (approval, card kind `rules`). Dishes, counts, meal, day and place come from the shopper's words via `mealWords`, never the model. An ambiguous dish is refused with the names to ask about; `ask_shopper` clarify now accepts dish names the shopper's words matched.
  - The rules model routes meal sentences (ask, then log). Eval cases `meal-out`, `meal-hinglish` and `meal-skipped` pass under rules.
  - The KOI bar sends meal sentences to Track.
- `lib/plan/patterns.js` (`eatOutPatterns`): "lunch out three Tuesdays of the last four". Its "plan it as out" action is a weekly Calendar event, so it is wired in P6.
- **Deviation from the plan:** there are no `/api/track/meal` or `/api/track/rebalance` routes. Track writes through RLS like the weigh-ins (useCheckins), the engines are pure and run where the data is (the browser for Track, the server for the agent), and the WhatsApp webhook will call the same modules.
- **Verified:**
  - Tests: estimate (9), mealWords (4), rebalance (9), patterns (2), and 1 new in schedule. The suite is 671/671; eslint passes, as do `buildRecipes --check` and `next build`.
  - **A Playwright walk with Supabase answered by fixtures** (cookie session, household, a plan over test-catalogue SKUs made two days earlier, the meal log in memory), at 1440 and 390: ate breakfast; logged lunch out (a big restaurant chicken biryani, ≈ 1,480 kcal); applied "spread over 4 days" plus "cook it on Saturday lunch"; undid it and redid it; opened from "kal raat bahar pizza khaya".
- **Not verified live:** the real database (00091 unapplied), `/store/profile/data` (gated server-side), the agent's `log_meal` with a model, and an exact-macros Take 2 in the browser (the unit test covers it).

### 23 Oct · P6 Calendar
- Migration **00092_calendar_event**. **Not applied** (database blocked).
  - Event kinds: out, training, travel, prep, shop, plan, remind, auto.
  - An event is once (`starts_on`, with `ends_on` for a range) or weekly (`repeat_days`, 0 = Sunday, `until`).
  - Fields: `slot` for a meal out; `at_time`; and `plan_effect` (`{setting, size, kcal}` for a meal out).
  - RLS through the household owner (`koi_uid()`). A person's event must name a member of that household.
  - Plus `household.calendar_token` and `calendar_feed(token)`, a SECURITY DEFINER function anyone can call that returns one household's events for its secret address.
  - **Deviation:** dates, weekdays and a local time instead of an RRULE string and `starts_at`/`ends_at`. That's simpler to validate and to read in the planner; the iCal export writes the RRULE.
- `lib/calendar/events.js`:
  - `datesOf` and `occurrences` expand events into dates.
  - `weekFromCalendar(events, span)` gives the planner:
    - `away` ("date:slot" → members with no plate there; out and travel);
    - `outs` (a typical meal out from `GENERIC_MEALS`, or the size the person picked);
    - `training` (dates per member);
    - `prepDays` (weekdays, counting the day before the week).
  - `toICS`: RFC 5545 with an IST VTIMEZONE, the first instance on a matching weekday, ranges ending the day after, escaped text, and lines folded at 75 octets (TextEncoder, so it works in the browser).
  - `eventProblems`, in words.
- `lib/calendar/words.js` (`readScheduleSentence`) reads, by rules:
  - kinds, weekdays (including plurals, weekdays/weekends/daily, Hindi day names) and dates ("3 to 5 Nov", "28 dec to 2 jan" across years, tomorrow, next week, this weekend);
  - times, the meal and the person (a saved label);
  - a reminder's title.
  - Past dates are refused.
  - `mealWords` gains `NOT_YET` ("every", "tomorrow"…): a habit is the Calendar's, not a meal eaten.
- **The week reads the Calendar** (`usePlanSession`):
  - `buildWeek({away})` leaves no plate for whoever is out or away (`cell.away`); the table still cooks for the others.
  - Batching uses the calendar's prep days when there are any.
  - Carb cycling uses a person's calendar training days (four a week only as the fallback).
  - Someone on their own numbers has each meal out as a **fixed** plate in `sizePortions`, so the rest of the day is sized around it.
  - `platesOfDay`, the ledger and the Take 2 carry meals out (`outs`): "Out, from your Calendar, a typical lunch out about 750 kcal, until you say what it was". A meal out is never resized or plate-scaled.
- **UI:**
  - `/store/calendar` (header nav; the phone's Plan tab stays lit on Track and Calendar; Track links to it). It has:
    - a week board (Mon–Sun, chips by kind, the plan's days marked, "+" per day);
    - KOI's suggestion from `eatOutPatterns`, which wires P5's habit: "lunch out on Tuesdays 3 of the last 4 weeks… Plan it as out?", adding a weekly meal out from today; "Not now" is remembered on the device;
    - "How KOI plans around it";
    - the subscription address (make, copy, open as webcal, turn off), and a `.ics` download.
  - `EventSheet` asks each kind only what it needs.
  - `?add=<their words>` opens it filled in. WeekGrid shows "Out, from your Calendar" and "Me: out" chips.
- `GET /api/calendar/feed/<token>` returns the feed through `calendar_feed` with the anonymous client (no service role): 404 for an unknown token, 503 with Retry-After when the database can't be read.
- **KOI:**
  - Agent tool `schedule` (approval card): the event comes from the shopper's words via `words.js`; the model may only name the kind.
  - The rules model routes scheduling sentences. Eval cases `schedule-out`, `schedule-gym` and `schedule-trip` pass under rules.
  - The KOI bar sends scheduling sentences to `/store/calendar?add=`.
- **Verified:**
  - Tests: events (4), words (3), the out-plate Take 2, and the schedule test. Suite 679/679; eslint and `next build` pass.
  - Fixture-backed Playwright, 1440 and 390: the suggestion from three seeded Tuesday lunches out, then "Plan it as out", then "gym on mon wed fri at 7am" from the address, filled in and saved.
  - Then next week's board, Track's Tuesday ("Out, from your Calendar"), and the Plan grid (Wife's lunch cooked, "Me: out").
  - The feed route's 404 and 503.
- **Not verified live:** 00092 applied, a real subscription in Google or Apple Calendar, and `schedule` with a model.

### 23 Oct · P7 Auto-plan and notifications
- Migration **00093_autoplan_notifications**. **Not applied** (database blocked; the Supabase MCP refuses this account).
  - `autoplan_job`: one per household, with a weekday, an IST `local_time`, `rules` (days, budget, member_ids, start), `channels` (in_app, whatsapp), `paused`, `next_run_at` and the last run. RLS through the household owner.
  - `notification`, the inbox. It is written by the server only; the recipient gets SELECT and DELETE and `UPDATE (read_at)`. Each row has:
    - `template` and `template_params`, the WhatsApp template it maps to;
    - `channels` and `sent` per channel;
    - a unique `(recipient_id, ref)`, so it is sent once.
  - `notify_consent`: per person and channel; opted in or out, when, and how (settings, a WhatsApp reply, KOI). The phone stays the auth identity, never copied.
  - `plan.status` already allowed `draft` (00044).
- `lib/plan/autoplan.js`:
  - `nextRunAt`: IST, strictly after now, correct across UTC and IST midnight.
  - `startsOnFor` (the day after the run, or the Monday after), `rulesOf`, `jobWords` and `dueJobs`.
- `lib/notify/templates.js`: one template per kind (autoplan_ready, autoplan_failed, reminder, plan_day, shop_day), plus `whatsappPayload` (the Cloud API template message, parameters in order).
- `lib/notify/dispatch.js`:
  - The in-app row is the message, and `ref` dedupes.
  - The WhatsApp adapter is written against the Cloud API but inert: it needs `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` and a recorded opt-in that hasn't been withdrawn. The number comes from `auth.admin.getUserById`.
- `lib/plan/autoplanRun.js` (`runAutoplan`, `runReminders`):
  - Due jobs go through `planForHousehold` with the job's client. **New optional `db` parameter; every other caller is unchanged.**
  - The plan is marked `draft` with `constraints.starts_on` and `auto: true`, scoped by `household_id`. The owner is notified; the next run and last plan are set.
  - An infeasible plan is deleted, and the owner gets a plain reason.
  - Reminders, planning days and shopping days from the Calendar are sent in their hour, 9 am if untimed, once per event per day.
- `GET /api/engine/autoplan`: behind CRON_SECRET, with the service client because nobody is signed in. The `lib/supabase/admin.js` header now records this as the one sanctioned user-data use and why.
- `vercel.json` gets an hourly cron. **Check before deploying: Vercel Hobby only allows daily crons** and rejects the deploy otherwise. The run catches up on everything due, so a daily schedule (e.g. `30 12 * * *`, 6 pm IST) would still work, only less precisely.
- **Drafts never replace the week until approved:**
  - the restore query skips `status = 'draft'`;
  - `weekStartOf` starts a week on its `starts_on`;
  - `reviewDraft`, `approveDraft({toCart})` and `discardDraft`;
  - `/store/plan?review=<id>` opens a draft with `DraftBanner` (Approve and add to cart / Approve / Discard).
  - Changes come after approval, so a draft is never half-adopted.
- **UI:**
  - On the Calendar: the Auto-plan card (On or Paused, the next run, the last run or its error, Change, Pause) and `AutoPlanSheet`. The sheet sets the day and time, days, start, budget and who's eating; in-app is always on, and WhatsApp shows as coming soon, opt-in only.
  - The job is drawn on the board as an "auto" event.
  - The header bell (`Inbox`) has an unread badge and a sheet of notifications: open (marks read), Mark all read, Dismiss. It refreshes on focus and every 5 minutes, and reads leniently before 00093.
- **Verified:**
  - Tests: autoplan (3), templates (3), autoplanRun (3) against a fake Supabase that records scoping. The suite is 688/688; eslint, `buildRecipes --check` and `next build` pass.
  - The live route: 401 without the secret; with it, it reaches the database, which returns the 402.
  - A fixture-backed Playwright walk: turn on auto-plan; the card reads "Every Sunday at 6 pm… Next: Sun 25 Oct" and the board shows it; the bell reads "1 new"; the notification opens the draft (the grid starts Wed 28, its `starts_on`); Approve removes the banner and the bell clears.
- **Not verified live:** a real cron run (needs the database and the planner's catalogue), WhatsApp (no credentials, by decision), and approving into a real cart.

## Waiting on the database
Apply in order through the Supabase MCP (standing consent) once KOI-PLATFORM is out of its 402 restriction and this account has access, then verify each with SQL:
- **00087 food_items** and **00088 recipe_quantities**: regenerate with `buildRecipes.mjs` first if foods or recipes changed (`--check`).
- **00089 member_macro_targets.**
- **00090 household_cooking.**
- **00091 member_meal_log.**
- **00092 calendar_event.**
- **00093 autoplan_notifications.**

Until then, meals and calendar events are kept on the device (pending) and Take 2s in local storage. All of them sync on the first load after the tables exist.

## Demo mode: every page without Supabase (23 Oct)
Asked for while KOI-PLATFORM is blocked. `npm run dev:demo` (from `web/`) starts the dev server with `NEXT_PUBLIC_KOI_DEMO=1`.
- **Signed in as a demo household:**
  - Me: a lifter on his own numbers.
  - Wife: vegetarian.
  - Kid: a peanut allergy.
- **Seeded data:** atta, rice and poha in the pantry; three Tuesday lunches out; Mon/Wed/Fri training; weigh-ins; an inbox note.
- **The first plan:** made by the real planner over the test catalogue the first time the demo opens.
- **How it works:**
  - Every Supabase call goes to a local stand-in (`src/lib/supabase/demo`), browser, server and planner alike.
  - `engine.js` covers the PostgREST subset KOI uses: filters, embeds, JSON paths, upsert on conflict columns, single rows, counts.
  - `store.js` keeps the tables in `web/.demo/db.json` (gitignored) and emulates `save_household_member` and `calendar_feed`.
  - `/api/demo/db` is the browser's way in.
- **Signing in:** `getVerifiedUser` and `proxy.js` treat the demo shopper as signed in. Signing out works; signing in again takes any phone and code.
- **"Demo · reset"** in the header restores the seed and clears this browser's `koi_*` keys.
- **Development only:** `isDemo()` is false in production builds (`NODE_ENV`), and the route answers 404.
- **Not in demo mode:** the agent's model calls still need their own keys (the rules model works offline), and Swiggy hand-off and label reading still need their real services.
