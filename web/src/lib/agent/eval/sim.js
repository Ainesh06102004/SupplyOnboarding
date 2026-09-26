// ============================================================================
// Agent Mode evaluation: a simulated household and store the loop can run
// against with the REAL model, no database. Pure.
//
// The tools here keep KOI's contracts — the readiness gates, what may be
// saved, the cart only when asked — over an in-memory household, so an
// evaluation measures the model's routing and the loop's pauses, not the
// planner (which has its own evaluation, scripts/evalPlanner.mjs).
// ============================================================================

import { gapsFor, gapWords, askCardFor } from "../readiness";
import { readBrief, draftFrom } from "@/lib/planner/brief";
import { ASKS_CART } from "../router";
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
    look: { kind: "read", run: async (c, { what }) => ({ ok: true, summary: "Looked", forModel: what === "household" ? `Saved: ${world.saved.map((p) => p.label).join(", ") || "none"}.` : world.planId ? `Plan with ${world.basket.join(", ")}.` : "No plan yet." }) },
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
        return { ok: true, summary: `Drafted ${members.length}`, forModel: `Drafted, not saved: ${members.map((m) => m.label).join(", ") || "nobody new"}. Missing: ${gapWords(gaps)}.${gaps.length ? " KOI is asking the shopper now." : members.length ? " Next: save_people source=draft." : ""}`, ask: gaps.length ? askCardFor(gaps, { draft: c.memory.draft }) : null };
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
        if (unknown.length) return { refused: `${unknown.map((u) => u.person).join(", ")} not saved.` };
        return { card: { kind: "save_people", people: (args.changes ?? []).map((ch) => ({ label: ch.person })) } };
      },
      execute: async (c, args) => {
        if (args.source === "draft") {
          world.saved.push(...c.memory.draft.members.map((m) => ({ label: m.label, age_band: m.age_band, diet_type: m.diet_type })));
          c.memory.draft = null;
        } else {
          world.changes.push(...(args.changes ?? []).map((ch) => ({ person: ch.person, ...ch })));
        }
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
        if (!world.planId) return { refused: "No plan to put in the cart." };
        return { card: { kind: "cart", lines: world.basket.map((n, i) => ({ skuId: String(i), name: n, packs: 1 })) } };
      },
      execute: async () => { world.cart = world.basket.length; return { ok: true, summary: "Added", forModel: "Added to the cart.", end: true }; },
    },
    ask_shopper: {
      kind: "ask",
      card: (c, { topic }) => ({ card: { kind: "ask", questions: [{ id: topic, header: topic, kind: "single", options: [{ key: "a", label: "7 days" }, { key: "b", label: "No budget" }] }] } }),
    },
    finish: { kind: "end", run: async (c, { outcome }) => ({ ok: true, summary: "Done", forModel: "Finished.", end: true, outcome }) },
  };
  return { world, ctx, tools };
}
