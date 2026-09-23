// ============================================================================
// What the Plan page shows of a solved plan. Pure.
//
// Every figure here is one the planner produced or a label declared: packs,
// cost and shares from the report, kcal and protein from the same per-pack
// label figures the solver used (report.basket[].supplies), per-day values as
// the period's totals divided by its days. Nothing is estimated to fill a gap:
// a figure that is not declared stays null, and the page shows nothing for it.
// ============================================================================

import { nodeInfo } from "@/lib/food/taxonomy";

const isNum = (v) => v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v));
const round = (n, places = 0) => {
  const f = 10 ** places;
  return Math.round(Number(n) * f) / f;
};
export const rupees = (n) => (isNum(n) ? `₹${Math.round(Number(n)).toLocaleString("en-IN")}` : "—");
const dayCount = (days) => `${days} ${Number(days) === 1 ? "day" : "days"}`;

/** The design's five rows of a day. */
export const SLOTS = Object.freeze([
  { key: "breakfast", label: "Breakfast", occasions: ["breakfast"] },
  { key: "lunch", label: "Lunch", occasions: ["lunch"] },
  { key: "snack", label: "Snack", occasions: ["snacks", "office_snacks", "pre_workout", "post_workout", "late_night"] },
  { key: "dinner", label: "Dinner", occasions: ["dinner"] },
  { key: "drinks", label: "Drinks", occasions: [] },
]);

/**
 * Where a product sits in a day, from its shelf (food.category_occasion and
 * the aisle's meal role). The first slot it serves, and the others it also does.
 * @param {string|null} categoryKey
 * @returns {{ slot: string, also: string[] }}
 */
export function slotsFor(categoryKey) {
  const info = categoryKey ? nodeInfo(categoryKey) : null;
  if (!info) return { slot: "anytime", also: [] };
  if (info.role === "drink") return { slot: "drinks", also: [] };
  const serves = SLOTS.filter((s) => s.occasions.some((o) => info.occasions.includes(o))).map((s) => s.key);
  if (serves.length) return { slot: serves[0], also: serves.slice(1) };
  if (info.role === "meal_base" || info.role === "cooking") return { slot: "lunch", also: ["dinner"] };
  if (info.role === "snack" || info.role === "sweet") return { slot: "snack", also: [] };
  return { slot: "anytime", also: [] };
}

/** The storefront's kinds of food, as things a person can want or skip this week. */
export function categoriesFrom(products = []) {
  const byKey = new Map();
  for (const product of products) {
    const key = product.categoryKey;
    if (!key || byKey.has(key)) continue;
    const info = nodeInfo(key);
    if (!info) continue;
    byKey.set(key, { key, label: info.subcategory ?? info.label, aisle: info.aisle });
  }
  return [...byKey.values()].sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Basket lines with the storefront product each one is (brand, photo, MRP, pack, aisle).
 * @param {Array} basket report.basket
 * @param {Array} products fetchAllProducts()
 */
export function enrichBasket(basket = [], products = []) {
  const bySku = new Map(products.filter((p) => p.skuId).map((p) => [String(p.skuId), p]));
  return basket.map((line) => {
    const product = bySku.get(String(line.skuId)) ?? null;
    const info = product?.categoryKey ? nodeInfo(product.categoryKey) : null;
    return {
      ...line,
      product,
      brand: product?.brand && product.brand !== "Unknown" ? product.brand : null,
      image: product?.image?.hero || null,
      price: isNum(product?.price) && Number(product.price) > 0 ? Number(product.price) : null,
      weight: product?.weight && product.weight !== "N/A" ? product.weight : line.packSize ?? null,
      categoryKey: product?.categoryKey ?? null,
      aisleKey: info?.aisleKey ?? "other",
      aisle: info?.aisle ?? "Other",
      estimate: Boolean(product?.testCatalogue),
    };
  });
}

/** Lines by aisle, in the order the aisles first appear. */
export function aislesOf(lines = []) {
  const groups = new Map();
  for (const line of lines) {
    if (!groups.has(line.aisleKey)) groups.set(line.aisleKey, { key: line.aisleKey, label: line.aisle, lines: [] });
    groups.get(line.aisleKey).lines.push(line);
  }
  return [...groups.values()];
}

/**
 * Each person against their targets, per day.
 * @param {object} report the plan report
 * @param {number} days
 * @returns {Array<{ id, label, goal, perDay: {kcal, protein}, target: {kcal, protein}, coverage: {kcal, protein}, short: {nutrient, perDay}[], met: boolean }>}
 */
export function peopleOf(report = {}, days = 7) {
  const d = Math.max(1, Number(days) || 1);
  return (report.perMember ?? []).map((m) => {
    const per = (v) => (isNum(v) ? round(Number(v) / d) : null);
    const perDay = { kcal: per(m.achieved?.kcal), protein: per(m.achieved?.protein) };
    const target = { kcal: per(m.asked?.kcal), protein: per(m.asked?.protein) };
    const cover = (got, want) => (isNum(got) && isNum(want) && want > 0 ? Math.min(100, Math.round((got / want) * 100)) : null);
    const short = Object.entries(m.shortfall ?? {}).map(([nutrient, amount]) => ({ nutrient, perDay: round(Number(amount) / d) }));
    return {
      id: m.id,
      label: m.label ?? "Someone",
      goal: m.goal ?? null,
      perDay,
      target,
      coverage: { kcal: cover(perDay.kcal, target.kcal), protein: cover(perDay.protein, target.protein) },
      short,
      met: short.length === 0,
    };
  });
}

/**
 * The week board: for each slot of a day, what each person has from the basket,
 * per day. The planner plans the week's food, not dishes, so a product sits in
 * the first slot its shelf serves; `also` names the others it could go in.
 * @param {object} report with whoEatsWhat
 * @param {Array} lines enrichBasket()
 * @param {number} days
 */
export function weekBoard(report = {}, lines = [], days = 7) {
  const d = Math.max(1, Number(days) || 1);
  const bySku = new Map(lines.map((l) => [String(l.skuId), l]));
  const people = (report.whoEatsWhat ?? []).map((w) => ({ id: w.member, label: w.label ?? "Someone" }));
  const rows = [...SLOTS.map((s) => ({ key: s.key, label: s.label })), { key: "anytime", label: "Any time" }]
    .map((row) => ({ ...row, cells: Object.fromEntries(people.map((p) => [p.id, []])) }));
  const rowByKey = new Map(rows.map((r) => [r.key, r]));

  for (const person of report.whoEatsWhat ?? []) {
    for (const item of person.allowed ?? []) {
      if (!(Number(item.packs) > 0)) continue;
      const line = bySku.get(String(item.skuId));
      const { slot, also } = slotsFor(line?.categoryKey ?? null);
      const perDay = isNum(item.amount) ? round(Number(item.amount) / d) : null;
      rowByKey.get(slot).cells[person.member].push({
        skuId: item.skuId,
        name: item.name ?? line?.name ?? "A product",
        perDay,
        unit: item.unit ?? null,
        packs: item.packs,
        also,
        notVerifiedFor: item.notVerifiedFor ?? [],
      });
    }
  }
  return { people, rows: rows.filter((r) => r.key !== "anytime" || Object.values(r.cells).some((c) => c.length)) };
}

/**
 * The basket's biggest protein sources, from label figures only.
 * @returns {Array<{ skuId, name, grams, perDay, share }>}
 */
export function proteinSources(lines = [], days = 7, max = 5) {
  const d = Math.max(1, Number(days) || 1);
  const withProtein = lines.filter((l) => isNum(l.supplies?.protein) && l.supplies.protein > 0);
  const total = withProtein.reduce((sum, l) => sum + Number(l.supplies.protein), 0);
  return withProtein
    .map((l) => ({ skuId: l.skuId, name: l.name, grams: round(l.supplies.protein), perDay: round(l.supplies.protein / d), share: total > 0 ? Math.round((l.supplies.protein / total) * 100) : 0 }))
    .sort((a, b) => b.grams - a.grams)
    .slice(0, max);
}

/** The plan's size and cost at a glance. */
export function totalsOf(plan) {
  const report = plan?.report ?? {};
  return {
    cost: report.cost ?? null,
    budget: report.budget ?? null,
    withinBudget: report.withinBudget ?? null,
    products: report.summary?.products ?? 0,
    packs: report.summary?.packs ?? 0,
    everyTargetMet: report.summary?.everyTargetMet ?? null,
    days: plan?.days ?? report.summary?.days ?? null,
  };
}

const describeLimit = (limit) =>
  `${limit.name ?? "A product"} (${limit.members.map((m) => `${m.label ?? "someone"} ${m.perDay ?? "?"} ${m.unit ?? ""}`.trim()).join(", ")})`;

/**
 * What the plan gave up, as lines. `warn` marks the ones that cost the shopper
 * something — a shortfall, a budget in the way, money spent over what was said.
 */
export function noteLines(plan) {
  const e = plan?.explanation;
  if (!e) return [];
  const days = dayCount(plan.days);
  const notes = [
    { text: `Reached: ${String(e.reached ?? "").replace(/_/g, " ")}${e.gave_up ? ` — gave up ${e.gave_up}` : " — nothing was given up"}`, warn: Boolean(e.gave_up) },
    { text: `Never relaxed: ${(e.never_relaxed ?? []).join(" and ")}` },
  ];
  if (e.budget_raised_for_targets) {
    notes.push({
      warn: true,
      text: `Spent ${rupees(e.budget_raised_for_targets.extra)} over the ${rupees(e.budget_raised_for_targets.from)} asked for, because this household put its targets above its budget`,
    });
  }
  if (e.priority_held) {
    notes.push({ text: `Solved for ${e.priority_held.priority.replace(/_/g, " ")} first, then everything else within ${Math.round(e.priority_held.tolerance * 100)}% of it` });
  }
  for (const c of e.carb_ceilings ?? []) {
    notes.push({
      text: `${c.label} is on ${c.pattern === "keto" ? "keto" : "low carb"}: at most ${c.perDay} g of carbohydrate a day`
        + (c.undeclared > 0 ? `, and ${c.undeclared} ${c.undeclared === 1 ? "product was" : "products were"} left out for them because their carbohydrate isn't declared` : ""),
    });
  }
  for (const s of e.skipped_this_week ?? []) {
    notes.push({ text: `${s.label} asked to skip ${s.categories.map((key) => nodeInfo(key)?.subcategory ?? nodeInfo(key)?.label ?? key).join(", ")} this week` });
  }
  if ((e.products_refused ?? []).length > 0) notes.push({ text: `${e.products_refused.length} products left out because no one in the household can eat them` });
  if ((e.products_kept_out ?? []).length > 0) {
    notes.push({ text: `Kept out of the house: ${e.products_kept_out.map((p) => `${p.name ?? "a product"} (${p.because})`).join(", ")}` });
  }
  if ((e.products_not_plannable ?? []).length > 0) notes.push({ text: `${e.products_not_plannable.length} products KOI cannot plan with yet (no price, or a pack it cannot measure)` });
  if ((e.products_priced_out ?? []).length > 0) {
    notes.push({ text: `Left out because their nutrition costs far more than the rest of the catalogue: ${e.products_priced_out.map((p) => p.name ?? "a product").join(", ")}` });
  }
  if ((e.products_too_big ?? []).length > 0) {
    notes.push({ text: `Packs too big to finish in ${days}: ${e.products_too_big.map((p) => p.name ?? "a product").join(", ")}` });
  }
  if ((e.portion_limited ?? []).length > 0) {
    notes.push({ text: `Held to a day's portions: ${e.portion_limited.map(describeLimit).join("; ")}` });
  }
  if ((e.unmet ?? []).length > 0) {
    notes.push({ warn: true, text: `Short: ${e.unmet.map((u) => `${u.label} ${u.short} ${u.nutrient}`).join(", ")}` });
  }
  if (e.budget_blocked) {
    notes.push({
      warn: true,
      text: `Your budget is what stands in the way: meeting the targets would take about ${rupees(e.budget_blocked.cost)} (${rupees(e.budget_blocked.extra)} more)`
        + ((e.budget_blocked.unmet ?? []).length > 0 ? ", and even then some targets stay short" : ""),
    });
  }
  return notes;
}
