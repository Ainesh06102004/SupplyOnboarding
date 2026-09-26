# KOI Agent Mode: design brief for Claude Design

**What to design:** one glass chat dock that lives on every page of the KOI store. It drives the whole weekly food plan: household → targets → plan → dishes → pantry → cart → tracking. The shopper types one sentence. KOI does the work on the page in front of them, and stops only when it genuinely needs them.

**Keep the current front end.** The six-step Plan page and the store pages stay as they are; they are the canvas. The dock is the new layer on top.

---

## 0. How to use this brief

1. Paste **section 1** into Claude Design as the opening prompt.
2. Attach the following:
   - `KOI - Nutrition Planner.html`: the founder's original design for the Plan page. Its look is the source of truth.
   - `docs/agent-mode/screens/*.png`: screenshots of today's store and Plan page, at desktop and phone width.
   - This file, as the reference for components, states, copy and example conversations (sections 2–14).
3. Link the codebase folders:
   - `web/src/components/store/plan/design/`
   - `web/src/app/store/plan/plan.css`
   - `web/src/components/store/landing/tokens.js`

   Run `/design-sync` on these for the design system. Don't link the whole repo, and exclude `node_modules` and `.git`.
4. When happy, use **Handoff to Claude Code**. The build expects the component names in section 8.

---

## 1. Paste-ready prompt

> Design **KOI Agent Mode**: a global, glassmorphism chat dock for KOI, an Indian grocery store that plans a household's week of food.
>
> **Canvas and driver.** The store pages and the six-step Plan page (Define · You · Plan · Pantry · Shop · Track) stay exactly as they look in the attached `KOI - Nutrition Planner.html` and screenshots. They are the canvas. Add one dock, present on every store page, that is the driver. The shopper types one sentence, for example *"plan this week's groceries for me, my wife and our two kids, we're vegetarian, the younger one is allergic to peanuts, budget 3500, and put it in my cart"*. KOI then works the page in front of them, like Claude Code or Codex working in a codebase:
> - it shows a short task checklist;
> - it streams what it is doing;
> - the page follows along to the step being worked on, and changed rows glow;
> - it **pauses only when it needs the shopper**: a question card with tappable options and a recommended one, or an approval card before saving people to the household or filling the cart.
>
> **What the dock can do.** Stop at any time. Queue a message while KOI works. Undo a whole run. Answer or approve without typing.
>
> **Design, with every state:**
> - the collapsed dock (a floating glass composer pill, bottom centre, above the phone tab bar);
> - the expanded conversation (a right-hand glass sheet on desktop, where the page stays usable; a bottom sheet on phones);
> - TaskChecklist, ToolCard (streaming lines), AskCard, ApprovalCard (a before/after diff of people), CartReview, ResultCard (plan cost and how much of each person's target it covers), and the "Jump to KOI" follow-along chip;
> - the glow on changed page elements.
>
> **Visual language.** Keep KOI's: warm off-white `#f6f5f1`, KOI green `#1f5c3a` / `#2f8050`, mint `#9fe7c4`, Plus Jakarta Sans for text, Space Grotesk for numbers, IBM Plex Mono for system lines, 22 px card radius.
> - The glass is calm and legible: frosted chrome, with near-opaque cards inside it.
> - While KOI works, a slow breathing green ring surrounds the dock.
> - Provide solid, non-blurred fallbacks for reduced transparency and high contrast.
>
> **Truthfulness.** KOI's own sentences never contain figures. Every number (₹, grams, kcal, packs) appears only inside cards that come from KOI's planner. Nothing medical, nothing like "healthy" or "cures". Allergies are shown as hard refusals ("Not for Kid 2: contains peanuts"). A label KOI couldn't check says "Not verified for tree nuts".
>
> **Deliverables:**
> - 2–3 variations of the collapsed dock and running state, shown side by side;
> - the full golden-path conversation (section 9A) as a clickable prototype at 1440, 768 and 390 px wide;
> - every component state listed in the attached brief.
>
> Name components exactly as in the brief so they carry through to code.

---

## 2. Product and audience

**What KOI is.** A curated Indian grocery store (koinorth.com/store) where every product's label and nutrition was checked. It adds a **planner**: KOI builds a household's week of groceries from what each person needs, and it never invents a nutrition figure.

**Who uses it.** One shopper, usually a parent, sometimes a young professional, on a phone, planning for a mixed household. For example: themselves, a spouse, two kids (4 and 9), and a grandparent who's 60 or over.
- Budget-conscious: they think in ₹ per week.
- Often vegetarian, Jain or eggetarian.
- Allergies matter.
- Messages mix Hindi and English ("hum do hamare do, budget 4k, bachon ko peanuts nahi").

**The moment.** Sunday evening, planning the week. They want to say it once and watch it get done, not fill six screens of forms.

**Emotional goal.** Calm competence. "KOI has this." The same feeling as watching a good assistant work: visible, quick, honest about what it can't do, and never doing anything irreversible without asking.

---

## 3. The concept

| Claude Code / Codex | KOI Agent Mode |
|---|---|
| The codebase | The store and the six-step Plan page |
| A prompt | One sentence in the dock |
| The todo list | TaskChecklist ("Set up your household · Build the week's plan · Review · Add to cart") |
| Tool calls streaming | ToolCard lines ("Checking 18 products… · Solving… · Stored") |
| AskUserQuestion | AskCard: 1–4 questions, tappable options, one marked *Recommended*, and "Other" to type |
| A permission prompt | ApprovalCard: *Allow* / *Not now*, with a diff of what will be saved |
| Diff review | ProfileDiff, CartReview, and glowing changes on the page |
| Esc to interrupt | Stop button; work already done stays |
| Messages queued while it works | QueuedMessage (grey, sent when the run ends) |
| Rewind | "Undo all of this" on a run |

**Principles the design must make visible:**
1. **The page is the proof.** KOI's claims live on the canvas: the plan, the week grid, the basket. The dock points at them; it doesn't replace them.
2. **It only stops when it must.** It asks about a kid's age, which diet, and who has the allergy. Days default to 7 and budget is optional, so they're never asked unless unclear.
3. **Nothing is saved or bought without Allow.** Plan changes apply at once and can be undone. Saving a person or a preference to the household asks first. Adding to the cart asks first. There is no checkout inside the dock.
4. **Figures come from KOI, never from the chat.** The narration is warm but has no numbers. Numbers sit in cards, set in Space Grotesk.

---

## 4. Where it lives

- **Every store page:**
  - `/store`, the landing page, which uses its own palette (section 5b);
  - `/store/shop`, the catalogue with a ⌘K search palette;
  - `/store/product/[id]`;
  - `/store/cart`;
  - `/store/household` (settings);
  - `/store/plan?step=define|you|plan|pantry|shop|track`.
- **Phones.** There is a floating bottom tab bar (fixed, 16 px from the bottom and sides, z-index 60). The collapsed dock sits **above it**, and the expanded sheet covers it.
- **The Plan page** has a sticky, blurred header: logo, six numbered step pills, and a second row of household member pills showing "goal · kcal". **Don't stack the dock's glass over this header.**
- **Signed out.** The dock is visible and the shopper can type. Sending opens the phone sign-in (OTP) card inside the sheet, and the held message sends after sign-in.

---

## 5. Visual language to keep

### 5a. Plan page (the founder's design; `tokens.js`, `plan.css`)
- **Background** `#f6f5f1`; surface `#ffffff`; surface2 `#faf9f6`; panel `#f0f4f0`.
- **Ink** `#1c1e17`; ink2 `#6b6f63`; muted `#8c8c84`; faint `#a7a89c`.
- **Primary green** `#1f5c3a`; accent `#2f8050`; deep `#0f3d2e`; mint `#9fe7c4`; mint chip `#dff0e6`; tint `#e8f1ea`; tint border `#cfe3d6`.
- **Warm** `#c2683a` on `#faece2`; logo dot `#e8743b`.
- **Red** `#c0392b` / text `#b84535` / bg `#fdf0ee`. **Warn** `#856404` on `#fff3cd`. **Blue** `#1a5276` on `#e8f0fb`.
- **Lines:** `rgba(20,22,15,.07)`; dashed `rgba(20,22,15,.18)`.
- **Member colours**, in order: `#1f5c3a #c2683a #3a6ea5 #9a5ba6 #b07d2b #2f8050`, with initials in a circle.
- **Type:** Plus Jakarta Sans (UI, 400–800); **Space Grotesk** for every figure; **IBM Plex Mono** for system and status lines, often uppercase with letter spacing.
- **Radius:** cards 22 px, tiles 14 px, pills 999 px. Cards are white with a 1 px hairline, no heavy shadows.
- **Motion:** `koiUp` (rise 16 px + fade), `koiPop` (scale in), `koiStrike` (a line striking through), `koiDraw` (an SVG line drawing), `koiRing` (a ring filling), `koiPulse` (breathing opacity), `koiSpin`.
- **Breakpoints:** 768 (stack everything, hide step labels) and 480.
- **The current agent timeline:** a dark green `CommandBox` on the Plan step, with a spinner and header ("KOI is working" → "KOI finished · 4.2 s"), mono lines with a pulsing dot while running and a mint ✓ when done, basket chips that pop in, and "↶ Undo all of this". **This box moves into the dock.**

### 5b. The rest of the store (`landing/tokens.js`)
- Forest `#083D2D`, green `#0C6B4C`, emerald `#16A06E`, mint `#EAF8F0`, off-white `#F9F8F4`, cream `#F5F1E8`, ink `#101412`.
- Sparing accents: orange `#F36A1D`, tangerine `#FF8B42`, butter `#F3F58A`, lime `#DDF247`.
- Headings in Bricolage Grotesque; body in Hanken Grotesk.

**The dock must look native on both.** Use the Plan page's type and greens for the dock itself; they sit comfortably on the store's forest and cream.

---

## 6. Glassmorphism direction

**The chrome**
- The dock pill and the sheet frame are glass: a frosted, warm off-white at about 74% opacity.
- Backdrop blur about 18 px, with saturation boosted about 160%.
- A 1 px border in white at about 55%, a faint inner top highlight, and a soft green-tinted shadow (for example `0 12px 40px rgba(31,92,58,.18)`).
- On dark or forest backgrounds (landing hero), use a smoked-green glass instead of white.

**The content** (cards, the transcript text) is near-opaque, white at 92–96%. Reading has to stay effortless.

**While running:** a slow breathing conic-gradient ring around the dock (`#1f5c3a` → `#2f8050` → `#9fe7c4`), about 3 s per breath, plus a live status line in IBM Plex Mono: "BUILDING YOUR PLAN · 3 OF 5".

**Waiting for the shopper:** the ring stops and turns warm (`#c2683a`). The collapsed pill reads "KOI needs you: 2 questions".

**Depth:** sheet over the page, cards over the sheet, and nothing else. No glass on glass on glass.

**Fallbacks (must be designed, not implied):**
- `prefers-reduced-transparency` or `prefers-contrast: more`: solid `#faf9f6` with a 1 px `#d9d7cd` border.
- `prefers-reduced-motion`: no breathing and no glow pulse; a static ring colour and a text status instead.
- Browsers without `backdrop-filter`: the solid version.

**Performance:** blur only the chrome, never animate the blur, and use a solid sheet body while it scrolls. iOS Safari is the main target.

---

## 7. Layout

### Desktop (1440)
- **Collapsed:** the pill is centred at the bottom, 24 px up, up to 720 px wide and 56 px tall, radius 28.
  - Left: the KOI logo dot.
  - Middle: the input ("Tell KOI what you need this week…").
  - Right: the send button, and while running the Stop button and the status line.
- **Expanded:** a right sheet about 440 px wide, full height minus the header gap.
  - The page reflows to the left or is overlapped. Show both options and recommend one.
  - The page stays interactive.
  - Top of the sheet: TaskChecklist (collapsible). Middle: the transcript. Bottom: the composer.
- **Follow-along:** when KOI works on the Plan step, the page navigates there and the changed elements glow. If the shopper clicks elsewhere, follow-along pauses and a "Jump to KOI" chip appears near the dock.

### Tablet (768)
The same as desktop, with the sheet at about 400 px, or a bottom sheet if the page gets too narrow.

### Phone (390)
- **Collapsed:** a 52 px pill above the tab bar.
- **Expanded:** a bottom sheet with a drag handle and two snap points. **Peek** (about 35%) shows the latest card and the composer, and the page is still visible. **Full** (about 88%) shows the whole transcript.
- The keyboard pushes the composer up.

---

## 8. Components (use these exact names)

| Component | What it is | States to design |
|---|---|---|
| **AgentDock** | The collapsed composer pill | idle (placeholder cycles through examples), focused, typing, running (ring and status, Stop), **waiting for you** (warm ring, "KOI needs you"), finished (a short "Done · Open plan" pill for 4 s), error ("KOI couldn't finish · Try again"), offline, signed-out, disabled |
| **AgentSheet** | The expanded conversation container | desktop right sheet; phone peek and full; empty first run; long transcript (30+ items) scrolled; with a pending AskCard pinned to the bottom |
| **TaskChecklist** | The run's plan, derived by KOI | pending, in progress (pulse), done ✓, skipped (with a reason), needs you; collapsed to a "2 of 4" chip |
| **UserBubble** | The shopper's message | normal, long (clamped with "more"), Hinglish, queued (grey, "Sends when KOI finishes") |
| **Narration** | KOI's short sentences, **never containing figures** | streaming, done; a subtle "KOI" avatar mark |
| **ToolCard / RunLines** | One tool call with its streaming lines (mono) | running (pulsing dot), done ✓, skipped (amber, with a note), failed; collapsed or expanded; nested planner lines ("Checked the catalogue: 16 of 18 plannable" [sample]) |
| **AskCard** | KOI's question, a fieldset | single choice (chips); multi-select (checkbox chips, e.g. "Who has the peanut allergy?"); many options (the age bands); "Recommended" badge; "Other" free text; several questions in one card, grouped by person (e.g. "Kid 1" and "Kid 2"); answered (collapses into a summary line); skipped |
| **ApprovalCard** | An Allow / Not now gate | save people (with ProfileDiff); save preferences (keep-out, pantry); declined ("Not saved; KOI planned for this week only"); approved (collapses into "Saved 4 people") |
| **ProfileDiff** | Before → after rows per person | a new person (all fields added, green); changed field; removed avoid (red strike via `koiStrike`, warning style); allergy rows emphasised; suggested targets with their source ("ICMR-NIN 2020" / "Mifflin–St Jeor") |
| **CartReview** | Review before adding to the cart | list of packs with product thumbnails; plan cost (Space Grotesk); "Add N packs to cart" / "Not now"; items you marked "have" excluded; added (collapses into "Added to cart · Open Shop") |
| **ResultCard** | What a plan tool produced | new plan (cost, days, people, a coverage ring per person, "Open plan"); changed plan (before → after cost, "Undo"); what-if without a product; product check verdicts (per person: fits / not for them + why / not verified for X) |
| **SignInCard** | Phone OTP inside the sheet | phone entry, OTP entry, error, success (the held message sends) |
| **QueuedMessage** | Typed while running | queued; "Send now" (= Stop, then send) |
| **StopButton** | Interrupt | idle / hover / stopping… / stopped ("Stopped · what's done is kept") |
| **JumpToKOI** | Follow-along chip | hidden, shown ("KOI is on Plan · Jump"), following |
| **PageGlow** | The highlight on changed page elements | a 1.2 s mint glow outline and fade, on a week-grid cell, a basket row, a member pill; reduced-motion version (a static outline for 3 s) |
| **UndoRun** | "↶ Undo all of this" | available, undoing, undone ("Back to how it was · the cart is unchanged") |
| **ModelNotice** | A small footnote on a run | "Read by KOI's rules" (when the AI is unavailable); "KOI left out 'diabetic': it can't plan around a health condition" |

**Also design:**
- a household of 6 people in the ProfileDiff and ResultCard;
- a run that fails halfway (one ToolCard failed, the rest done);
- a 60-second-plus run that continues automatically ("Still working: continuing…");
- the ⌘K palette on /store/shop gaining an **"Ask KOI"** row that hands the sentence to the dock.

---

## 9. Example conversations (real copy; figures are samples)

Figures marked [sample] are placeholders; in production every figure comes from KOI's planner.

### A. The golden path: a new shopper, from the store home
**Shopper:** plan this week's groceries for me, my wife and our two kids, we're vegetarian, the younger one is allergic to peanuts, budget 3500, and put it in my cart

**TaskChecklist:** ○ Set up your household · ○ Build the week's plan · ○ Review · ○ Add to cart

**Narration:** Got it: you, your wife and the two kids, vegetarian, with peanuts kept away from the younger one. A couple of quick things before I plan.

**AskCard** · header "Ages"
- *How old is Kid 1?* Child (1–3) · Child (4–6) · **Child (7–9)** · Child (10–12) · Teen (13–15) · Teen (16–18) · Other…
- *How old is Kid 2?* Child (1–3) · **Child (4–6)** · Child (7–9) · … · Other…
- ("Recommended" is shown only when KOI has a real reason, e.g. "the younger one". Otherwise nothing is pre-selected.)

**Shopper taps:** Kid 1: Child (7–9); Kid 2: Child (4–6).

**ApprovalCard** "Save 4 people to your household?"

| Person | Details |
|---|---|
| Me | Adult (19–59) · Vegetarian · targets suggested from ICMR-NIN 2020 |
| Wife | Adult (19–59) · Vegetarian |
| Kid 1 | Child (7–9) · Vegetarian |
| Kid 2 | Child (4–6) · Vegetarian · **Peanuts: Allergy (never, for safety)** |

→ **Allow** / Not now

**ToolCard** "Building the week's plan" (the page slides to Plan; the week grid fills)
- Read your household: 4 people
- Checked the catalogue: 16 of 18 plannable, 2 not for Kid 2 [sample]
- Solving: exact plan found
- Stored

**ResultCard:** ₹3,412 for 7 days [sample] · coverage rings for Me / Wife / Kid 1 / Kid 2 · "Open plan"

**CartReview:** 14 packs · ₹3,412 [sample] → **Add 14 packs to cart** / Not now

**Narration:** Done. Your week is planned and in the cart. Peanuts are kept away from Kid 2.
(The page moves to Shop.)

### B. A change, then undo
**Shopper:** make it cheaper and no maggi for the kids
- ToolCard "Changing the plan": Made it cheaper · No Maggi for Kid 1 and Kid 2
- ResultCard: ₹3,412 → ₹2,980 [sample] · **Undo**
- **Shopper:** actually undo that → UndoRun: "Back to how it was"

### C. On a product page
Viewing a peanut chikki.
- **Shopper:** is this ok for my son?
- If "son" isn't a label, **AskCard** "Which one is your son?": Kid 1 · Kid 2
- **ResultCard** (product check): **Not for Kid 2: contains peanuts.** Kid 1: fits their diet.
- (No "healthy", no health promises.)

### D. An allergy KOI can't fully verify
- **Shopper:** add almonds for everyone, but my wife has a tree nut allergy
- **ApprovalCard:** save "Tree nuts: Allergy" for Wife? → Allow
- ResultCard: almonds added for Me, Kid 1 and Kid 2 · **Not for Wife: contains tree nuts**
- Elsewhere: "Not verified for tree nuts" on a product whose label KOI couldn't fully check

### E. Medical words
- **Shopper:** my father is diabetic, plan low sugar stuff for him
- **ModelNotice:** KOI can't plan around a health condition. It left "diabetic" out.
- **AskCard** "Would 'less refined sugar' for Father help?": **Yes, prefer less refined sugar** · No
- (KOI never says it manages a condition.)

---

## 10. Copy rules and tone

- Warm, brief, first person as KOI ("I'll…", "Done."), and plain words. Sentence case. No exclamation marks.
- **No figures in KOI's sentences**, only in cards. People are named by their household labels ("Kid 2", "Wife"), never real names.
- **Never:** healthy, superfood, cures, boosts immunity, diabetic-friendly, low-GI, detox, guaranteed.
- **Safety wording:** "Not for {person}: contains {allergen}" · "Not verified for {allergen}" · "Kept away from {person}".
- **Questions:** short, with one line of context at most. The option labels are the real values ("Child (4–6)").
- **Approvals:** say exactly what will be saved, and that "Not now" keeps it to this week's plan.
- **Hinglish input is welcome.** KOI answers in English.

---

## 11. Motion

- The dock expands with a spring (about 280 ms) and cards enter with `koiUp` staggered by 40 ms.
- The running ring breathes (3 s ease-in-out). Tool lines pulse while running, and ✓ pops in with `koiPop`.
- Page follow-along: scroll and step change are eased. PageGlow is a mint outline that blooms and fades over 1.2 s.
- Waiting-for-you: the ring settles warm, with a gentle one-time nudge on the pill.
- Reduced motion: all of the above become instant or static.

---

## 12. Accessibility

- Text contrast of 4.5:1 or better on the worst background behind the glass. Design the solid fallback first.
- The transcript is a `log` region that announces politely. An AskCard is a `fieldset` with a `legend`, and each chip is a real radio or checkbox.
- Keyboard: `/` focuses the dock; Enter sends; Esc stops a run, or collapses the sheet if idle. Arrow keys move through options. Focus returns to the composer after an answer.
- Touch targets are 44 px or more. Don't rely on colour alone: ✓, ! and × marks accompany status colours.

---

## 13. Edge states to show

- First run, empty. The sheet shows three example prompts as chips:
  - "Plan this week for my family"
  - "What can my son eat from here?"
  - "Make my last plan cheaper"
- The AI is unavailable: the same flow, with ModelNotice "Read by KOI's rules".
- Nothing to do ("Your plan already does that"). A request KOI can't do ("KOI can't order for you yet; your cart is ready in Shop").
- Offline and reconnecting. A long run that continues automatically.
- A household of 6, and 12 packs or more in CartReview (scrolling).
- Signed out: the SignInCard flow.

---

## 14. Deliverables

1. 2–3 **AgentDock** directions (collapsed, running, and waiting), side by side, each on the store landing page (forest hero) and on the Plan page (off-white).
2. The full **golden path (9A)** as a clickable prototype at 1440, 768 and 390.
3. Screens for B–E.
4. A component sheet with every state in section 8, plus the solid, reduced-motion and dark-background variants.
5. **Handoff to Claude Code**, with the component names above.

**Out of scope:** checkout and payment (KOI doesn't check out from the dock); a voice mode; redesigning the six steps themselves.
