<!-- Living plan for KOI Agent Mode. Branch agent-mode. Progress is recorded under 'Build log' at the end. -->

# Plan: KOI Agent Mode — one glass chat that drives the whole store and the whole Plan

> This replaces the earlier plan in this file. That work (the founder's Plan page, Phases 0–6) is built and recorded in `Personal-research\koi-plan-page-plan.md`.

## Context
Today the Plan page's "agent" is a one-shot macro:
- One JSON-schema model call picks up to 5 steps, and the server runs them blind.
- The model never sees a result, never asks anything, and has no memory of the conversation.
- It can only touch the plan, and it lives in a box on the Plan step only (`lib/agent/router.js`, `run.js`, `steps.js`; `/api/plan/agent`).

The user wants the Codex / Claude Code experience:
- **One global chat.** One prompt drives the entire journey (household setup → targets → plan → dishes → pantry → cart → track). The agent **interrupts only when an input or an approval is genuinely needed**.
- **Keep the current front end.** The six-step page is the canvas the agent works on. Add **one global glassmorphism chat dock**. "Just cook hard."

Decisions (asked 26 Sep 2026):

| Question | Answer |
|---|---|
| Scope | **Every store page**: product pages, shop/search, cart, and the Plan page |
| Narration | **Grounded narration**: the model speaks, every line is validated, and a line that fails becomes a template |
| Memory | **This device only**: the transcript stays in the tab, and the server never stores the shopper's words |
| Permissions | **Ask before any save**: plan changes apply at once and can be undone; saving to the household and the cart need Allow; there is no auto-save mode and no checkout tool |

Deliverables:
1. A comprehensive plan doc.
2. **A Claude Design brief** for designing the whole thing.
3. The build, on a **separate branch**.

Research behind this plan:
- the current agent and its tools (three code explorations);
- Claude Code (plan mode, AskUserQuestion, permission prompts, Esc and queued messages, task checklist) and Codex (`request_user_input` with 2–4 options and a recommended default, `update_plan`, approval presets);
- human-in-the-loop patterns (OpenAI Agents SDK interruptions/RunState, LangGraph interrupt, Vercel AI SDK signed stateless approvals);
- the OpenAI Responses API tool loop (strict function tools, `parallel_tool_calls:false`, resending encrypted reasoning items when `store:false`);
- Anthropic's guidance on building effective agents and on writing tools;
- consumer commerce (Shipt, Instacart Clementine, ChatGPT checkout, Swiggy MCP COD-only): the cart is always reviewed with a single explicit confirmation.

## Invariants (carried over; the agent must never break them)
1. **The model reads, routes and picks tools. It never writes a figure, product, claim, basket or eligibility decision.**
   - Figures come from tools and appear in cards and templates.
   - Narration contains **no digits**.
   - Foods named must be in the evidence (the shopper's words, tool outputs, the basket, the page).
   - People must be household labels.
   - Text must pass `isClaimSafeText` and the `MEDICAL_TERMS` list (`lib/nutrition/claims.js`).
2. **The shopper's words are never stored server-side.**
   - OpenAI is called with `store:false`.
   - `plan_run` logs tools, outcomes and counts only.
   - The per-turn state summary sent to the model carries labels, gap flags and product names only. Never ages, diets, allergies or targets.
3. **Allergens, age safety and diet are never relaxed.** Unverifiable items say "Not verified for X". No disease wording.
4. **Confirm before saving a person or a preference.** Plan-only changes stay plan-only unless saved.
5. **No checkout and no Swiggy handoff.** Logistics and label reading remain deferred. Free text never reaches a supply provider.
6. **The planner reads the shopper's own words** (`inShoppersWords` learned that paraphrase loses the wife, the target and the allergy).
7. Rules fallback when there is no model. Everything sits behind flags.

## Architecture

### 1. Server loop (`web/src/lib/agent/loop.js`, model and tools injected so it can be tested)
**Model client**
- `callTools` in `lib/ai/providers/openai.js`, with pure `buildToolsRequest` / `readToolCall` in `openaiFormat.js`.
- Settings: Responses API, strict function tools, `tool_choice:"required"`, `parallel_tool_calls:false`, `store:false`, include `reasoning.encrypted_content`.
- 12 s per call, one retry on 5xx (model calls only; tools are never retried).
- `KOI_OPENAI_AGENT_MODEL` defaults to **gpt-5.4-mini** at low effort. Compare nano and gpt-5.6-luna (effort set explicitly) in evals.
- Inner readers (`readFollowUpWithModel`, `draftHousehold`) stay on nano, **on purpose**: they read the shopper's words.

**The loop**
```
POST /api/agent  (getVerifiedUser; rate-limit per uid; text ≤600)
  items  ← verifySigned(body.history)            // HMAC over uid; tampered items dropped
  ctx    ← {db: getServerSupabase(), uid, household, page: body.page, evidence, signal, t0}
  if resume: verify sig {uid, hh, callId, tool, argsHash, exp}; re-check policy + readiness;
             run the approved tool (or return "declined" + note) BEFORE any model turn
  if message: push the user item; add it to the evidence
  loop:
    stop if aborted (ReadableStream.cancel → flag; solveAndStore skips its insert when aborted)
    pause "time" at a tool boundary if >40 s, ≥10 turns or ≥16 tools (the client auto-continues, ≤3 segments)
    digest ← stateDigest(DB)            // rebuilt every turn, never stored; last in the prompt so the prefix caches
    gate   ← readiness(household, drafts, evidence)
    call   ← model(instructions, tools, items + digest)
    ask_shopper or gate blocks → server-built AskCard, signed; emit history; pause
    tool needs approval       → ApprovalCard (diff or cart), signed; emit history; pause
    same tool + same args twice → finish("capped")
    execute: tool_started → tool_progress (existing planner events) → tool_result; push the signed pair
    finish / add_to_cart → break
  insert plan_run (tools, ok, ms, asks, approvals, outcome — no words); emit run_finished
```
- **Rules fallback:** `rulesModel.js` produces tool calls from `routeMessage` plus the readiness gate, so the no-model path runs the same tools.
- **Idempotency:**
  - Creating a person is keyed by (household, normalised label); an existing label becomes an update.
  - Plan writes happen after approval, in the resume request, before any model call.

### 2. Tools (12; strict schemas; each returns `{forModel, events, summary}`)
| Tool | Kind | What it does |
|---|---|---|
| `look` | read | `what: household \| plan \| basket \| explanation \| page`. Returns labels, gap flags, basket names and packs, `noteLines`; the page context (current product or search) |
| `explore` | read | `kind: swaps \| without \| products`: `swapsFor`, `planWithout` (what-if only), or a match in KOI's catalogue via `lib/ai/intent` (never a supply provider) |
| `check_product` | read | `product: this \| name`, `people[]`. Runs eligibility (`eligibilityFilter`) and `unverifiedFor` per person. Answers in templates: "Not for Kid 2: contains peanuts", "Not verified for tree nuts" |
| `draft_people` | plan | `draftHousehold` on a quote of the shopper's words → people and gaps (no write) |
| `make_plan` | plan | `quote`, `days`, `budget {keep \| none \| set}`, `people[]`. Numbers must be in the evidence and readiness must be clear. Calls `planForHousehold` with `planArgs` |
| `change_plan` | plan | `quote \| answer_ref \| page_skus` → `planFollowUp` (text, or a structured reading such as `includeSkus` for "add this to my plan"). Undoable |
| `save_people` | **approval** | Create or update people: age band, diet, goal and pattern, sex, activity, add/remove avoids with severity, stated targets. Rules applied: `profileProblems` must pass; the server fills suggested targets (`goals.js`); **avoids are merged with what's already saved** (the RPC replaces the whole list, so a naive save would delete a peanut allergy); removals and downgrades appear in the diff; it can mark "this is me" (`account_profile_id`) |
| `save_kitchen_rules` | **approval** | keep-out add/remove, pantry keep (Phase 4) |
| `add_to_cart` | **approval** | Only if the shopper's words ask for it (`ASKS_CART`). CartReview shows packs and the plan's cost. The client runs `addToCart` and the run ends |
| `show` | ui | Plan step (6-value enum), shop with an interpreted search, a product, or the cart |
| `ask_shopper` | interrupt | `topic: who \| age \| diet \| avoid_who \| severity \| days \| budget \| which_person \| clarify`. **The server builds the question and options**; for `clarify`, options must come from the evidence, labels or the basket |
| `finish` | end | `outcome: done \| nothing_to_do \| cannot_do \| needs_shopper`, plus an optional `say` (validated or replaced by a template) |

Phase 4 adds `pick_dish` (plan_week), `mark_have` (this plan's "have it"), and `log_weigh_in` (approval; account holder only, adults only).

### 3. Readiness gate (`lib/agent/readiness.js`, pure; enforced *inside* the tools, not just as guidance to the model)
**Blocking**
- **R1** Nobody drafted or saved: "Who's eating?"
- **R2** A person with no age band. There is **no default**; every "kid" is asked. Chips for all 8 bands, with the role-word guess marked recommended.
- **R3** A person with no diet: 6 diet chips.
- **R4** An avoid not placed on a person when the household has more than one: multi-select of labels plus "Everyone" (recommended for allergens).

**Never blocking**
- **R5** Medical words: a template notice ("KOI can't plan around a health condition; it left 'diabetic' out").
- **R6** Duplicate labels are auto-numbered.

**Optional, asked only when it changes the plan:** days (recommended 7) and budget (none, or the last plan's cost).

Cards hold at most 4 questions, grouped by person. Each question has a recommended option first and "Other" for free text, like Claude Code's AskUserQuestion.

### 4. Event protocol v2 (NDJSON; `seq` and `runKey` on every event; 1 KB hello pad kept)
- `run_started`
- `tasks` (checklist derived by the server: Set up household · Targets · Build plan · Review · Cart…)
- `tool_started {callId, tool, label, route/step}`
- `tool_progress` (existing planner events, so `reduceRun` works unchanged)
- `tool_result {summary, data}`
- `ui {navigate \| highlight {member \| sku \| cell ids} \| search}`: highlights come from `basketChange`, never from the model
- `say`
- `ask {card, sig}`
- `approval {diff \| cart, sig}`
- `history {signed items}`
- `run_paused {ask \| approval \| time}`
- `run_finished {outcome, planId, createdPlanIds}`
- `error`

### 5. Client (store-wide)
**Mounting.** `AgentProvider` mounts in `web/src/app/store/layout.js` around `StoreNavigation` and the children, with `AgentDock` rendered once. It holds:
- a pure reducer (`lib/agent/client/reducer.js`) for transcript, run, cards, tasks and the queue;
- the transport (`lib/agent/client/transport.js`: fetch, abort, auto-continue, resume);
- storage in sessionStorage `koi_agent_v1:{uid}`, hydrated in an effect and cleared on sign-out.

**Page context.** Each request sends `{route, step, productId, planId, cart: [{skuId, qty}]}` and never page text. The server verifies the ids.

**Plan page bridge.** `usePlanSession` stays the owner of page state. It registers with the provider through `useAgentBridge` with:
- `beginRun` (snapshot for Undo);
- `applyEffects`, from a pure `lib/plan/agentEffects.js` shared with the v1 `agent()`;
- `flushAutosaves`;
- `holdMembers(ids)` (cancels the 700 ms autosave for anyone in an approval card);
- `reload()` after server saves;
- `addToCart`.

Off the Plan page, effects become navigation (e.g. "Open your plan" goes to `/store/plan?step=plan`, which restores from the DB via `lib/plan/restore.js`).

**Follow-along.**
- `tool_started.step` calls `go(step, {replace:true})` while follow is on.
- A manual step click uses `router.push`, which also fixes Back, and switches follow off. A "Jump to KOI" chip switches it back on.
- Highlights use a `HighlightContext` and a `useGlow(key)` hook in WeekGrid, ShopStep, PantryStep and the Header pills.

**Signed out.** The dock is visible and the prompt is held locally. Send opens the sign-in card (`LoginSheet`), and the held prompt goes out after OTP. Nothing reaches the model before sign-in.

**Controls.**
- Stop: AbortController. Work already done stays.
- Typing while a run is going queues the message in grey; it sends when the run ends. "Send now" = Stop, then send.
- Undo run (existing snapshot/undoRun, extended across segments). New chat.
- `/` focuses the dock and Esc stops or collapses. ⌘K on the shop stays the fast search palette and gains an "Ask KOI" row that hands the sentence to the dock.

**Retire.** The Plan step's `CommandBox` is hidden when the flag is on. Its `AgentRun` becomes the shared `RunLines`, used inside the dock's tool cards.

### 6. Glass UI (baseline; Claude Design owns the final look)
- **Dock, collapsed.**
  - A floating bottom-centre composer pill (max 720 px, radius 28), sitting above the mobile tab bar.
  - Glass: `rgba(246,245,241,.74)`, `backdrop-filter: blur(18px) saturate(160%)`, a 1 px white/55 border, an inner highlight and a soft green shadow.
  - While running: a breathing conic-gradient ring in KOI greens (#1f5c3a → mint), plus a live status line in IBM Plex Mono ("Building your plan · 3 of 5").
- **Expanded.**
  - A right glass sheet, about 440 px on desktop, where the page stays visible and usable as the canvas.
  - A bottom sheet with snap points (peek / 85%) at 768 px or less.
  - Cards inside are near-opaque for legibility: TaskChecklist pinned at top, user bubbles, KOI narration, ToolCard (collapsible `RunLines`), AskCard, ApprovalCard (ProfileDiff with added/removed rows using `koiStrike`), CartReview (packs and total), ResultCard (cost, coverage ring `koiRing`, "Open Plan / Shop").
- **Page glow.** Changed rows and cells get a 1.2 s mint glow.
- **Robustness.**
  - Solid fallback under `@supports not (backdrop-filter)`, `prefers-reduced-transparency` and `prefers-contrast: more`, and without motion under reduced motion.
  - Blur only the dock chrome; never stack it over the blurred Header; don't animate the blur.
  - A `--koi-dock-h` variable sets page padding and moves the Toast off its fixed `bottom:96`.
- **Accessibility.** The transcript is `role="log"` with `aria-live="polite"`; AskCards are fieldsets; focus returns after each answer; contrast 4.5:1 or better on the worst background.

### 7. Migration `00082_agent_mode_runs.sql`
- `plan_run.source` also allows `agent` and `agent_rules`; the step limit rises to 24. Check the auto-generated constraint names first.
- Add `run_key uuid`, `segment smallint`, `turns smallint`, `asks smallint`, `approvals jsonb` (tool plus decision only), `outcome text CHECK`, and `model text`, with an index on `run_key`.
- Still no words; grants unchanged. Apply via MCP and verify afterwards.

## The golden path (the demo this must nail)
Prompt, typed on any page: *"plan this week's groceries for me, my wife and our two kids, we're vegetarian, the younger one is allergic to peanuts, budget 3500, and put it in my cart"*
1. The task checklist appears. `draft_people` finds 4 people, all vegetarian, a peanut allergy on the younger kid (placed only if the draft can say which), and the kids' ages missing.
2. **AskCard** (one card): an age band for each kid (chips), plus "Which of you is allergic to peanuts?" if it couldn't be placed.
3. **ApprovalCard:** "Save 4 people to your household". Diets, the peanut allergy (severity: allergy), and suggested targets with their source. Allow.
4. `make_plan` (7 days, ₹3,500). The page follows to the Plan step, the planner streams, the week board fills, and a ResultCard shows cost and coverage.
5. **CartReview:** N packs, plan cost. Allow → the cart fills → the page moves to Shop, and `finish` narrates.
6. Follow-up: "make it cheaper and no maggi for the kids" → `change_plan`, with undo.
7. On a product page, "is this ok for my son?" → `check_product` → a template verdict.

## Build sequence (branch `agent-mode` from `plan-redesign`)
**Setup.** `git worktree add .claude/worktrees/agent-mode -b agent-mode plan-redesign`, then EnterWorktree(path). Commit and push per phase; fast-forward the main checkout only when asked.

**Phase 0 — Docs and foundations (no visible change)**
- `docs/agent-mode/PLAN.md`: this plan, expanded, with a copy at `Personal-research\koi-agent-mode-plan.md`.
- **`docs/agent-mode/claude-design-brief.md`**, written to Claude Design's guidance (goal, audience, layout, content, real examples, named components, states, variations):
  - **Paste-ready prompt** at the top; the rest is linked as reference.
  - **Product and audience:** Indian households; one shopper planning for family members of mixed ages.
  - **Existing design system to keep:** tokens, fonts, colours, radius, keyframes, breakpoints. Attach `KOI - Nutrition Planner.html`, and link `web/src/components/store/plan/design/`, `tokens.js` and `plan.css` for `/design-sync`.
  - **Concept:** the page as canvas, a glass dock as the driver, follow-along.
  - **Named component inventory** with every state: AgentDock (idle, focused, typing, running, waiting-for-you, error, offline, signed-out), AgentSheet, TaskChecklist, UserBubble, Narration, ToolCard/RunLines, AskCard (single, multi, Other, recommended), ApprovalCard/ProfileDiff, CartReview, ResultCard, QueuedMessage, StopButton, JumpToKOI chip, PageGlow, empty first-run, long transcript, a household of 6 people.
  - **Five scripted example conversations**, with sample numbers marked as sample: the golden path, a change and undo, a product-page check, an allergy question, and a medical-words notice.
  - **Copy rules:** no disease words, "Not verified for", templated figures.
  - **Glass spec plus accessibility fallbacks, and motion.**
  - **Deliverables:** 2–3 dock variations; desktop, 768 and 390 widths; an HTML prototype; Handoff to Claude Code.
- `docs/agent-mode/screens/`: Playwright screenshots of today's six steps, a product page, shop and cart, at desktop and 390 px, to attach to the brief. Also export the brief as .docx if pandoc is available.
- Fixes and foundations:
  - `keepBrief` runs `profileProblems`; a missing age band or diet blocks it.
  - `lib/household/save.js`: pure payload builders that merge avoids and never downgrade severity, used by the page and the server.
  - An abort `signal` in `lib/planner/plan.js`.
  - `callTools`, `buildToolsRequest` and `readToolCall`.
  - Migration 00082.
- **Verify:** `npm test`, `evalBrief`, `evalFollowUps` unchanged; a kid with no age band can't be kept.

**Phase 1 — Headless loop (flag `KOI_AGENT_MODE`; the route returns 404 when off)**
- New: `lib/agent/{loop, readiness, evidence, sign, protocol, digest, narration, rulesModel}.js`, `lib/agent/tools/*.js`, `app/api/agent/route.js`. Signing secret `KOI_AGENT_SIGNING_SECRET`.
- **Verify:**
  - unit tests with a scripted fake model: pause/resume, a tampered signature, caps, a repeated call, stop, continue, merged avoids;
  - a probe showing stream cancel fires and no orphan plan is left;
  - `scripts/evalAgentLoop.mjs`: at least 30 multi-turn scenarios with scripted answers, asserting tool choice, readiness asks, grounding, and narration validity;
  - red-team cases: an invented number, disease wording, removing an allergen, a cart nobody asked for, "checkout", another household's id (RLS).

**Phase 2 — Dock (flag `NEXT_PUBLIC_KOI_AGENT_MODE`)**
- `components/agent/{AgentProvider, AgentDock, AgentSheet, Transcript, ToolCard, RunLines, AskCard, ApprovalCard, ProfileDiff, CartReview, ResultCard, TaskChecklist}.jsx`.
- `lib/plan/agentEffects.js`, the `usePlanSession` bridge, follow-along and highlights, and the store layout mount. Build to the Claude Design handoff if it's ready, else to the baseline spec above.
- **Verify:** the golden path end to end in Playwright (signed in) on the worktree dev server; Stop mid-solve; reload mid-conversation; Undo run; follow-along; Back.

**Phase 3 — Glass polish and robustness**
- Glass tokens and fallbacks, the mobile sheet, queued messages, auto-continue segments, the signed-out prompt hold with the sign-in card, and the ⌘K "Ask KOI" row.
- **Verify:** axe, keyboard only, iOS Safari (real device or BrowserStack), contrast checks, and the 390 px layout.

**Phase 4 — The rest of the journey**
- `pick_dish`, `mark_have`, `save_kitchen_rules`, and `log_weigh_in` (Track, after "this is me" links the account holder).
- Product-page and cart-page flows. The narration kill-switch `KOI_AGENT_NARRATION`.
- A model comparison (mini, nano, luna) on cost and latency.
- Retire the v1 router path once loop evals reach at least 90%.

## Risks and mitigations
- **Latency and cost.** About 4–6 turns per run: roughly $0.02–0.03 on mini and $0.006 on nano. The planner (3–15 s) dominates. Keep instructions and tools as a fixed prefix so it caches, with the summary last.
- **Tool-calling reliability.** Strict schemas, 12 tools, one call per turn, errors that say what to do (`needs_input` with the gaps), the repeated-call guard, and the rules model after two failures.
- **60 s `maxDuration`.** Split at 40 s at tool boundaries and continue automatically. This also protects flaky mobile streams.
- **State races.** Flush and hold autosaves; reload after server saves; re-read the DB every request (the transcript is memory, never state).
- **Privacy.** Words live only in the tab; signed items are bound to the uid; encrypted reasoning is kept only for an open turn.
- **iOS blur cost and glass accessibility.** Blur the chrome only, with solid fallbacks as above.

## Verification (end to end)
- `npm test` (all existing plus the new loop, readiness, sign, narration and effects tests); `evalAgentLoop.mjs` at 90% or better; `evalAgent`, `evalBrief` and `evalFollowUps` unchanged; `npm run build`.
- Supabase: apply 00082, check constraints and grants, and a two-account RLS check.
- Playwright (signed in, worktree dev server): the golden path; a product-page check; Stop, reload, Undo; mobile 390 px; screenshots attached to the PR/doc.
- A grep that no new component hardcodes a nutrition figure or a ₹ amount.
- Report with branch, commits, and how to see it (the main checkout won't have it until fast-forwarded).

## Files (critical)
- **New:**
  - `web/src/lib/agent/{loop,readiness,evidence,sign,protocol,digest,narration,rulesModel}.js`, `web/src/lib/agent/tools/*`, `web/src/lib/agent/client/*`
  - `web/src/app/api/agent/route.js`, `web/src/components/agent/*`, `web/src/lib/plan/agentEffects.js`, `web/src/lib/household/save.js`
  - `supabase/migrations/00082_agent_mode_runs.sql`, `docs/agent-mode/*`, `web/scripts/evalAgentLoop.mjs`
- **Modified:**
  - `web/src/lib/ai/providers/openai.js` and `openaiFormat.js`, `web/src/lib/planner/plan.js` (signal)
  - `web/src/components/store/plan/design/usePlanSession.js` (bridge, keepBrief validation), `web/src/app/store/plan/page.js` (push vs replace, follow), `web/src/app/store/layout.js` (mount)
  - `PlanStep.jsx` (CommandBox behind the flag), `bits.jsx` (Toast offset), `plan.css` (glass), `components/store/shop/CommandSearch.jsx` (Ask KOI row)
- **Reused as-is:** `planForHousehold`, `planFollowUp`, `planWithout`, `draftHousehold`, `groundSteps` logic, `routeMessage`, `suggestTargets`, `profileProblems`, `swapsFor`, `unverifiedFor`, `eligibilityFilter`, `interpret`, `reduceRun`, `readNdjson`, `restore.js`, `noteLines`, `undoRun`.


## Build log

- 27 Sep 2026: branch agent-mode created from plan-redesign (1853144); Claude Design brief written (docs/agent-mode/claude-design-brief.md).
