// ============================================================================
// Agent Mode evaluation: a simulated household and store the loop can run
// against with the REAL model, no database. Pure.
//
// The tools here keep KOI's contracts — the readiness gates, what may be
// saved, the cart only when asked — over an in-memory household, so an
// evaluation measures the model's routing and the loop's pauses, not the
// planner (which has its own evaluation, scripts/evalPlanner.mjs).
// ============================================================================

import { gapsFor, gapWords, askCardFor, nextAskFor, detailsCardFor } from "../readiness";
import { readBrief, draftFrom } from "@/lib/planner/brief";
import { ASKS_CART } from "../router";
import { asksForParticularProducts } from "../cartWords";
import { isQuote, norm } from "../evidence";

/**
 * @param {{ saved?: Array<{label, age_band, diet_type}>, plan?: boolean, basket?: string[], page?: object }} start
 */
export function simulated(start = {}) {
  const world = {
    saved: (start.saved ?? []).map((p) => ({ ...p })),
    planId: start.plan ? "plan-0" : null,
    basket: start.basket ?? (start.plan ? ["Atta", "Toor Dal", "Dates", "Paneer", "Oats"] : []),
    cart: 0,
    plans: 0,
    changes: [],
    checked: [],
    shown: [],
  };
  const page = start.page ?? { route: "home" };
  const ctx = {
    events: [],
    emit(e) { ctx.events.push(e); },
    signal: null,
    page,
    labels: () => world.saved.map((p) => p.label),
    products: () => world.basket,
    snapshot: async () => ({ saved: world.saved, savedCount: world.saved.length, draft: ctx.memory?.draft ?? null, planId: world.planId, hasPlan: Boolean(world.planId), basket: world.basket, page, productName: page.productName ?? null, cartCount: 0 }),
  };
  const quoted = (c, quote) => (quote && !isQuote(quote, c.evidence()) ? null : quote || c.memory.said.at(-1) || "");

  const tools = {
    look: {
      kind: "read",
      run: async (c, { what }) => {
        world.looked = [...(world.looked ?? []), what];
        if (what === "household") return { ok: true, summary: "Looked", forModel: `Saved: ${world.saved.map((p) => p.label).join(", ") || "none"}.` };
        if (!world.planId) return { ok: false, forModel: "There is no plan yet. make_plan first." };
        if (what === "menu") return { ok: true, summary: "Menu", forModel: "The week's dishes are shown in the chat: Mon: breakfast Poha; lunch Dal + Rice; snack Roasted Chana; dinner Paneer + Roti | Tue: breakfast Upma; lunch Rajma + Rice; snack Makhana; dinner Dal + Roti." };
        if (what === "per_day") return { ok: true, summary: "Per day", forModel: "Per-person daily figures are shown in the chat (the plan's daily average)." };
        return { ok: true, summary: "Looked", forModel: `Plan with ${world.basket.join(", ")} (shown in the chat).` };
      },
    },
    draft_people: {
      kind: "plan",
      run: async (c, { quote }) => {
        const q = quoted(c, quote);
        if (q === null) return { ok: false, forModel: "quote must be verbatim" };
        const latest = c.memory.said.at(-1) ?? "";
        const text = norm(latest).includes(norm(q)) ? latest : q;
        // The production reader when the eval runs with a model; the rules' otherwise.
        const draft = c.draftHousehold ? await c.draftHousehold(text) : draftFrom(readBrief(text));
        const members = draft.members.filter((m) => !world.saved.some((s) => norm(s.label) === norm(m.label)));
        c.memory.draft = members.length ? { members, avoidEveryone: draft.avoidEveryone ?? [] } : null;
        const gaps = gapsFor(c.memory.draft, { savedCount: world.saved.length });
        const next = c.memory.draft ? nextAskFor(c.memory.draft, { savedCount: world.saved.length, asked: c.memory.detailsAsked ?? {} }) : null;
        if (next?.details) c.memory.detailsAsked = { ...(c.memory.detailsAsked ?? {}), [next.details]: true };
        return { ok: true, summary: `Drafted ${members.length}`, forModel: `Drafted, not saved: ${members.map((m) => m.label).join(", ") || "nobody new"}. Missing: ${gapWords(gaps)}.${next ? " KOI is asking the shopper now; wait for their answers." : members.length ? " Next: save_people source=draft." : ""}`, ask: next?.card ?? null };
      },
    },
    save_people: {
      kind: "approval",
      prepare: async (c, args) => {
        if (args.source === "draft") {
          if (!c.memory.draft?.members?.length) return { refused: "There is no draft to save." };
          const gaps = gapsFor(c.memory.draft, { savedCount: world.saved.length });
          if (gaps.length) return { gaps, card: askCardFor(gaps, { draft: c.memory.draft }) };
          return { card: { kind: "save_people", people: c.memory.draft.members.map((m) => ({ label: m.label })) } };
        }
        const unknown = (args.changes ?? []).filter((ch) => !world.saved.some((s) => norm(s.label) === norm(ch.person)));
        if (unknown.length) return { refused: `${unknown.map((u) => u.person).join(", ")} is not a saved person. Saved: ${world.saved.map((p) => p.label).join(", ")}.` };
        return { card: { kind: "save_people", people: (args.changes ?? []).map((ch) => ({ label: ch.person })) } };
      },
      execute: async (c, args) => {
        if (args.source === "draft") {
          world.saved.push(...c.memory.draft.members.map((m) => ({ label: m.label, age_band: m.age_band, diet_type: m.diet_type })));
          c.memory.draft = null;
        } else {
          world.changes.push(...(args.changes ?? []).map((ch) => ({ person: ch.person, ...ch })));
        }
        if (args.this_is_me) for (const p of world.saved) p.is_account_holder = norm(p.label) === norm(args.this_is_me);
        return { ok: true, summary: "Saved", forModel: "Saved." };
      },
    },
    make_plan: {
      kind: "plan",
      run: async (c) => {
        if (!world.saved.length) return { ok: false, forModel: "Nobody is saved yet. draft_people, then save_people source=draft." };
        if (c.memory.draft?.members?.length) return { ok: false, forModel: "Drafted people aren't saved. save_people source=draft first." };
        world.planId = `plan-${++world.plans}`;
        world.basket = ["Atta", "Toor Dal", "Dates", "Paneer", "Oats"];
        c.memory.planId = world.planId;
        return { ok: true, summary: "Planned", forModel: "Plan made for 7 days; within budget: yes; short of a target: nobody.", data: { kind: "plan" } };
      },
    },
    change_plan: {
      kind: "plan",
      run: async (c, { quote, add_this_product: addThis }) => {
        if (!world.planId) return { ok: false, forModel: "There is no plan to change. make_plan first." };
        const text = addThis ? "add this product" : quoted(c, quote);
        if (text === null) return { ok: false, forModel: "quote must be verbatim" };
        world.changes.push(text);
        return { ok: true, summary: "Changed", forModel: `Changed: ${text}.`, data: { kind: "change" } };
      },
    },
    explore: { kind: "read", run: async (c, { kind, product }) => (kind !== "products" && !world.planId ? { ok: false, forModel: "No plan yet." } : { ok: true, summary: "Explored", forModel: `${kind} for ${product ?? "that"}: shown.` }) },
    check_product: {
      kind: "read",
      run: async (c, { product, people }) => {
        if (!world.saved.length) return { ok: false, forModel: "Nobody is saved yet." };
        if ((!product || norm(product) === "this") && !page.productId) return { ok: false, forModel: "The shopper isn't viewing a product; ask which one." };
        world.checked.push({ product, people });
        return { ok: true, summary: "Checked", forModel: "Checked: shown to the shopper." };
      },
    },
    show: { kind: "ui", run: async (c, args) => { world.shown.push(args.step ?? args.target); return { ok: true, summary: "Shown", forModel: "Shown." }; } },
    add_to_cart: {
      kind: "approval",
      prepare: async (c) => {
        if (!c.memory.said.some((s) => ASKS_CART.test(norm(s)))) return { refused: "The shopper didn't ask for the cart." };
        const latest = c.memory.said.at(-1) ?? "";
        if (ASKS_CART.test(norm(latest)) && asksForParticularProducts(latest)) return { refused: "The shopper asked for particular products, not the whole plan: use edit_cart with their words." };
        if (!world.planId) return { refused: "No plan to put in the cart." };
        return { card: { kind: "cart", lines: world.basket.map((n, i) => ({ skuId: String(i), name: n, packs: 1 })) } };
      },
      execute: async () => { world.cart = world.basket.length; return { ok: true, summary: "Added", forModel: "Added to the cart.", end: true }; },
    },
    week_menu: { kind: "ui", run: async (c, args) => { if (!world.planId) return { ok: false, forModel: "There is no plan yet. make_plan first." }; world.menu = args; return { ok: true, summary: "Asked", forModel: "The page will change the week's dishes.", ui: { menu: args } }; } },
    edit_cart: {
      kind: "approval",
      prepare: async (c, { changes }) => ((changes ?? []).length ? { card: { kind: "cart_edit", rows: [], lines: [] } } : { refused: "Nothing to change." }),
      execute: async (c, { changes }) => { world.cartEdits = changes; return { ok: true, summary: "Changed", forModel: "Cart changed." }; },
    },
    accept_track_proposal: {
      kind: "approval",
      prepare: async () => (world.saved.some((p) => p.is_account_holder) ? { card: { kind: "rules", rows: [] } } : { refused: "KOI doesn't know which saved person is the shopper. Ask which_person, then save_people with this_is_me." }),
      execute: async () => { world.proposalAccepted = true; return { ok: true, summary: "Updated", forModel: "Daily calories updated." }; },
    },
    save_kitchen_rules: {
      kind: "approval",
      prepare: async (c, args) => {
        const lists = ["keep_out_add", "keep_out_remove", "pantry_add", "pantry_remove", "refuse_brands_add", "prefer_brands_add", "brands_remove"].reduce((n, k) => n + (args[k] ?? []).length, 0);
        const settings = ["waste", "repeat", "processing_ceiling", "shelf_stable_only", "cuisine"].some((k) => args[k] !== null && args[k] !== undefined) || (args.priorities ?? []).length > 0;
        return lists || settings ? { card: { kind: "rules", rows: [] } } : { refused: "Nothing would change." };
      },
      execute: async (c, args) => { world.rules = args; return { ok: true, summary: "Saved", forModel: "Saved the kitchen rules." }; },
    },
    log_weigh_in: {
      kind: "approval",
      prepare: async (c, { kg }) => {
        const me = world.saved.find((p) => p.is_account_holder);
        if (!me) return { refused: "KOI doesn't know which saved person is the shopper. Ask which_person, then save_people source=changes with this_is_me." };
        if (!c.evidence().numbers.has(Number(kg))) return { refused: `The shopper didn't say ${kg} kg.` };
        return { card: { kind: "rules", rows: [] } };
      },
      execute: async (c, { kg }) => { world.weighIn = kg; return { ok: true, summary: "Logged", forModel: "Logged." }; },
    },
    ask_shopper: {
      kind: "ask",
      card: (c, { topic, about }) => {
        world.askedTopics = [...(world.askedTopics ?? []), topic];
        const held = world.saved.find((p) => norm(p.label) === norm(about ?? ""));
        if (topic === "details") return held ? { card: detailsCardFor({ ...held, age_band: held.age_band ?? "adult_19_59" }, { saved: true, fields: ["age_years", "weight_kg"] }) } : { refused: "about must be a saved person's label." };
        if (topic === "age" || topic === "diet") return held ? { card: askCardFor([{ kind: topic, person: held.label }], { draft: { members: [held] } }) } : { refused: "about must be a saved person's label." };
        return { card: { kind: "ask", questions: [{ id: topic, header: topic, kind: "single", options: [{ key: "a", label: "7 days" }, { key: "b", label: "No budget" }] }] } };
      },
    },
    finish: { kind: "end", run: async (c, { outcome }) => ({ ok: true, summary: "Done", forModel: "Finished.", end: true, outcome }) },
  };
  return { world, ctx, tools };
}
