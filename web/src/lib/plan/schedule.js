// ============================================================================
// A week of dishes from a solved basket. Pure.
//
// The planner decides what to buy and how much of it each person eats over
// the period (report.whoEatsWhat). This turns that into days and meals the way
// a kitchen would: a base and a main at lunch and dinner (or one pot), a
// breakfast, a snack, a drink. It never changes a quantity. Each person's
// share of a product is spread over the meals it is cooked in, so "Dal tadka ·
// 73 g of moong dal" is the planner's own figure divided by how often it is
// served — and a product no dish uses stays on their plate as it is, in the
// slot its shelf serves ("+ Almonds 29 g").
//
// Choosing is greedy and deterministic:
//   * a dish must be one everyone eating it can have (lib/food/dishes.js);
//     anyone who can't gets their own of the same kind, or nothing, said why;
//   * dishes the basket supplies come first; a dish's anchor (its staple, not
//     its ghee or sugar) must be in the basket for it to count as supplied;
//   * a dish repeats less the lower the household's repeat tolerance;
//   * the shopper's own choices (overrides) win.
// ============================================================================

import { DISHES } from "@/lib/food/dishData";
import { dishFor } from "@/lib/food/dishes";
import { allergensIn } from "@/lib/food/allergens";
import { slotsFor } from "@/lib/plan/planView";

export const SLOT_KEYS = Object.freeze(["breakfast", "lunch", "snack", "dinner", "drinks"]);
export const SLOT_LABELS = Object.freeze({ breakfast: "Breakfast", lunch: "Lunch", snack: "Snack", dinner: "Dinner", drinks: "Drinks" });
/** Which profile meals put someone at the table for a slot (meals_from_home, 00050). */
const AT_TABLE = Object.freeze({ breakfast: ["breakfast"], lunch: ["lunch", "tiffin"], snack: ["snacks"], dinner: ["dinner"] });
/** Shelves that are a dish's staple. Ghee, oil, sugar and spices are not what makes a dal a dal. */
const SIDE_SHELVES = Object.freeze(["fats_oils", "sweeteners", "spices"]);
const REPEAT_PENALTY = Object.freeze({ low: 4, usual: 2.5, high: 1 });
const DAY_NAMES = Object.freeze(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);

const isNum = (v) => v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v));
const ingredientsIn = (name) => new Set(allergensIn(String(name ?? "")).ingredients ?? []);
const isAnchor = (line) => line.supply === "shelf" && !line.optional && !SIDE_SHELVES.includes(String(line.category).split(".")[0]);

/** A small, stable number from a string, to rotate between equally good dishes. */
function jitter(text) {
  let h = 0;
  for (const c of text) h = (h * 31 + c.charCodeAt(0)) % 997;
  return h / 997;
}

/** Basket lines that can supply a recipe line. */
function suppliersOf(line, basket) {
  if (line.supply !== "shelf") return [];
  return basket.filter((b) => b.categoryKey === line.category && (line.anyOfShelf || b.ingredients.has(line.ingredient)));
}

/**
 * @param {object} input
 * @param {object} input.report the plan report (basket, whoEatsWhat)
 * @param {Array} input.lines enrichBasket() lines (categoryKey, name)
 * @param {Array} input.people profiles of the people eating: memberId, label, age_band, diet_type, avoids, meals_from_home, spice_tolerance, favourite_categories
 * @param {number} input.days
 * @param {Date} [input.start]
 * @param {object} [input.overrides] { "day:slot": { dishes: [dishKey, …] } } — the shopper's own picks
 * @param {"low"|"usual"|"high"} [input.repeat]
 * @param {Array} [input.dishes] defaults to dishData.js
 */
export function buildWeek({ report = {}, lines = [], people = [], days = 7, start = new Date(), overrides = {}, repeat = "usual", dishes = DISHES }) {
  const d = Math.max(1, Math.min(14, Number(days) || 7));
  const basket = lines.map((l) => ({ ...l, skuId: String(l.skuId), ingredients: ingredientsIn(l.name) }));
  const byDish = new Map(dishes.map((dish) => [dish.key, dish]));
  const eats = new Map((report.whoEatsWhat ?? []).map((w) => [String(w.member), new Map((w.allowed ?? []).filter((a) => Number(a.packs) > 0).map((a) => [String(a.skuId), a]))]));
  const everyone = people.map((p) => String(p.memberId));
  const penalty = REPEAT_PENALTY[repeat] ?? REPEAT_PENALTY.usual;

  // Who can have each dish, once.
  const verdicts = new Map();
  const verdict = (dish, person) => {
    const key = `${dish.key}|${person.memberId}`;
    if (!verdicts.has(key)) verdicts.set(key, dishFor(dish, person));
    return verdicts.get(key);
  };

  // What of the basket a dish would use for one person: anchors must be theirs to eat.
  const usesFor = (dish, memberId) => {
    const theirs = eats.get(memberId) ?? new Map();
    const used = [];
    for (const line of dish.lines.filter((l) => l.supply === "shelf")) {
      const supplier = suppliersOf(line, basket).find((b) => theirs.has(b.skuId));
      if (supplier) used.push({ skuId: supplier.skuId, anchor: isAnchor(line) });
      else if (isAnchor(line)) return null; // the staple isn't in their basket
    }
    return used;
  };

  const eatersOf = (slot) => {
    if (slot === "drinks") return everyone;
    const wanted = AT_TABLE[slot];
    const withMeals = people.filter((p) => (p.meals_from_home ?? []).length);
    // Nobody said which meals they eat at home: everyone, every meal.
    if (!withMeals.length) return everyone;
    return people.filter((p) => !(p.meals_from_home ?? []).length || p.meals_from_home.some((m) => wanted.includes(m))).map((p) => String(p.memberId));
  };

  const count = new Map(); // dishKey -> times served
  const lastServed = new Map(); // dishKey -> day index
  const favourites = new Set(people.flatMap((p) => p.favourite_categories ?? []));

  const score = (dish, memberIds, day) => {
    let s = 0;
    for (const id of memberIds) {
      const used = usesFor(dish, id);
      if (!used) return -Infinity;
      s += used.filter((u) => u.anchor).length * 3 + used.length * 0.5;
    }
    s /= Math.max(1, memberIds.length);
    if (dish.lines.some((l) => l.supply === "shelf" && favourites.has(l.category))) s += 1;
    s -= penalty * (count.get(dish.key) ?? 0);
    if (lastServed.get(dish.key) === day - 1) s -= penalty;
    return s + jitter(`${dish.key}:${day}`) * 0.3;
  };

  /** The best dish of these kinds for these people, and who of them can't have it. */
  const pick = (kinds, slot, memberIds, day) => {
    const pool = dishes.filter((dish) => kinds.includes(dish.kind) && dish.slots.includes(slot));
    let best = null;
    for (const dish of pool) {
      const can = memberIds.filter((id) => verdict(dish, people.find((p) => String(p.memberId) === id) ?? {}).ok);
      if (!can.length) continue;
      const s = score(dish, can, day);
      if (s === -Infinity) continue;
      // Everyone at the table first, then the better dish.
      const rank = can.length * 100 + s;
      if (!best || rank > best.rank) best = { dish, can, rank };
    }
    return best;
  };

  const serve = (dish, day) => {
    count.set(dish.key, (count.get(dish.key) ?? 0) + 1);
    lastServed.set(dish.key, day);
  };

  /** A meal for these people in this slot: one dish, or a base with a main. */
  const mealFor = (slot, memberIds, day) => {
    if (slot === "lunch" || slot === "dinner") {
      const onePot = pick(["one_pot"], slot, memberIds, day);
      const base = pick(["base"], slot, memberIds, day);
      const main = pick(["main"], slot, memberIds, day);
      const pair = base && main ? { dishes: [base.dish, main.dish], can: base.can.filter((id) => main.can.includes(id)), rank: Math.min(base.rank, main.rank) + 1 } : null;
      // A one-pot meal every few days, when it serves as many people.
      const preferPot = onePot && (!pair || onePot.can.length > pair.can.length || (onePot.can.length === pair.can.length && day % 3 === 2));
      return preferPot ? { dishes: [onePot.dish], can: onePot.can } : pair;
    }
    const kinds = slot === "breakfast" ? ["breakfast"] : slot === "snack" ? ["snack"] : ["drink"];
    const one = pick(kinds, slot, memberIds, day);
    return one ? { dishes: [one.dish], can: one.can } : null;
  };

  const slots = SLOT_KEYS.filter((slot) => eatersOf(slot).length);
  const dayList = Array.from({ length: d }, (_, i) => {
    const date = new Date(start.getTime() + i * 86400000);
    return { index: i, date: date.toISOString().slice(0, 10), label: DAY_NAMES[date.getDay()], dayOfMonth: date.getDate(), today: i === 0 };
  });

  const cells = {};
  const served = new Map(); // memberId -> skuId -> uses
  const noteUse = (memberId, dish) => {
    for (const u of usesFor(dish, memberId) ?? []) {
      const m = served.get(memberId) ?? new Map();
      m.set(u.skuId, (m.get(u.skuId) ?? 0) + 1);
      served.set(memberId, m);
    }
  };

  for (const day of dayList) {
    for (const slot of slots) {
      const key = `${day.index}:${slot}`;
      const at = eatersOf(slot);
      const forced = overrides[key]?.dishes?.map((k) => byDish.get(k)).filter(Boolean);
      let meal;
      if (forced?.length) {
        const can = at.filter((id) => forced.every((dish) => verdict(dish, people.find((p) => String(p.memberId) === id) ?? {}).ok));
        meal = { dishes: forced, can, chosen: true };
      } else {
        meal = mealFor(slot, at, day.index);
      }
      const cell = { key, day: day.index, slot, shared: null, own: {}, none: {}, notes: {} };
      if (meal && meal.can.length) {
        cell.shared = { dishes: meal.dishes.map((dish) => ({ key: dish.key, name: dish.name, kind: dish.kind })), eaters: meal.can, chosen: Boolean(meal.chosen) };
        meal.dishes.forEach((dish) => serve(dish, day.index));
        for (const id of meal.can) {
          meal.dishes.forEach((dish) => noteUse(id, dish));
          const person = people.find((p) => String(p.memberId) === id) ?? {};
          const said = meal.dishes.map((dish) => verdict(dish, person));
          const leaveOut = said.flatMap((v) => v.leaveOut);
          const notVerifiedFor = [...new Set(said.flatMap((v) => v.notVerifiedFor))];
          const dislikes = [...new Set(said.flatMap((v) => v.dislikes))];
          if (leaveOut.length || notVerifiedFor.length || dislikes.length) cell.notes[id] = { leaveOut, notVerifiedFor, dislikes };
        }
      }
      // Anyone the shared meal doesn't suit gets their own, or is told why not.
      for (const id of at.filter((x) => !(meal?.can ?? []).includes(x))) {
        const own = mealFor(slot, [id], day.index);
        const person = people.find((p) => String(p.memberId) === id) ?? {};
        if (own) {
          cell.own[id] = { dishes: own.dishes.map((dish) => ({ key: dish.key, name: dish.name, kind: dish.kind })) };
          own.dishes.forEach((dish) => { serve(dish, day.index); noteUse(id, dish); });
        } else {
          const why = meal?.dishes?.map((dish) => verdict(dish, person)).find((v) => !v.ok)?.because ?? null;
          cell.none[id] = why ?? "nothing in the basket suits them here";
        }
      }
      cells[key] = cell;
    }
  }

  // What each person gets per serving, and what no dish uses (their additions).
  const perServing = (memberId, skuId) => {
    const a = eats.get(memberId)?.get(String(skuId));
    const uses = served.get(memberId)?.get(String(skuId)) ?? 0;
    if (!a || !uses || !isNum(a.amount)) return null;
    return { amount: Math.round(Number(a.amount) / uses), unit: a.unit ?? null };
  };
  const additions = {};
  for (const id of everyone) {
    const used = served.get(id) ?? new Map();
    additions[id] = [...(eats.get(id)?.values() ?? [])]
      .filter((a) => !used.has(String(a.skuId)))
      .map((a) => {
        const line = basket.find((b) => b.skuId === String(a.skuId));
        return {
          skuId: String(a.skuId),
          name: a.name ?? line?.name ?? "A product",
          slot: slotsFor(line?.categoryKey ?? null).slot,
          perDay: isNum(a.amount) ? Math.round(Number(a.amount) / d) : null,
          unit: a.unit ?? null,
          notVerifiedFor: a.notVerifiedFor ?? [],
        };
      });
  }

  return { days: dayList, slots, cells, additions, perServing, usesFor: (dishKey, memberId) => usesFor(byDish.get(dishKey), memberId) ?? [], alsoNeed: alsoNeed(cells, byDish, basket) };
}

/** What the week's dishes need that the basket doesn't bring: fresh, kitchen, and shelves not bought. */
function alsoNeed(cells, byDish, basket) {
  const need = new Map();
  for (const cell of Object.values(cells)) {
    const dishes = [...(cell.shared?.dishes ?? []), ...Object.values(cell.own).flatMap((o) => o.dishes)];
    for (const { key } of dishes) {
      const dish = byDish.get(key);
      for (const line of dish.lines.filter((l) => !l.optional)) {
        const supplied = line.supply === "shelf" && suppliersOf(line, basket).length > 0;
        if (supplied) continue;
        const kind = line.supply === "shelf" ? "shop" : line.supply;
        const entry = need.get(line.ingredient) ?? { ingredient: line.ingredient, kind, category: line.category, dishes: new Set(), meals: 0 };
        entry.dishes.add(dish.name);
        entry.meals += 1;
        need.set(line.ingredient, entry);
      }
    }
  }
  const list = [...need.values()].map((e) => ({ ...e, dishes: [...e.dishes] })).sort((a, b) => b.meals - a.meals);
  return {
    fresh: list.filter((e) => e.kind === "fresh"),
    kitchen: list.filter((e) => e.kind === "kitchen"),
    shop: list.filter((e) => e.kind === "shop"),
  };
}

/**
 * Dishes that could go in this cell instead: the same kinds, served in this
 * slot, that everyone eating here can have.
 */
export function alternativesFor(cell, people, dishes = DISHES) {
  if (!cell?.shared) return [];
  const kinds = new Set(cell.shared.dishes.map((x) => x.kind));
  const eaters = people.filter((p) => cell.shared.eaters.includes(String(p.memberId)));
  return dishes
    .filter((dish) => kinds.has(dish.kind) && dish.slots.includes(cell.slot) && !cell.shared.dishes.some((x) => x.key === dish.key))
    .filter((dish) => eaters.every((p) => dishFor(dish, p).ok))
    .map((dish) => ({ key: dish.key, name: dish.name, kind: dish.kind }));
}
