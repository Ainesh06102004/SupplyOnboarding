"use client";

// ============================================================================
// /store/plan/dish/[key] — a dish's recipe, for what is being cooked now.
//
//   ?batch=A        the batch's cook: every box for everyone who eats it
//   ?cell=2:lunch   one meal: the plates at that table
//   (neither)       standard servings, 1 / 2 / 4
//
// The plates come from the household's plan (usePlanSession): someone on their
// own numbers gets their sized grams (lib/plan/portions.js), everyone else the
// recipe's serving. Signed out, or with no plan, it is still a recipe.
// ============================================================================

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { usePlanSession } from "@/components/store/plan/design/usePlanSession";
import { cookPlan } from "@/lib/food/cookPlan";
import RecipeView from "@/components/store/recipe/RecipeView";
import CookMode from "@/components/store/recipe/CookMode";

export default function DishPage() {
  return (
    <Suspense fallback={<p role="status" className="koi-page font-koi-sans text-sm font-medium text-koi-muted">Opening the recipe…</p>}>
      <Dish />
    </Suspense>
  );
}

function Dish() {
  const { key } = useParams();
  const search = useSearchParams();
  const s = usePlanSession();
  const [unit, setUnit] = useState("kitchen");
  const [servings, setServings] = useState(1);
  const [cooking, setCooking] = useState(false);

  const batchId = search.get("batch");
  const cellKey = search.get("cell");
  const batch = batchId ? (s.batches ?? []).find((b) => b.id === batchId && b.dishes.some((d) => d.key === key)) ?? null : null;
  const cell = !batch && cellKey ? s.week?.cells?.[cellKey] ?? null : null;
  const dayLabels = useMemo(() => Object.fromEntries((s.week?.days ?? []).map((d) => [String(d.index), d.label])), [s.week]);

  const plan = useMemo(
    () => cookPlan({ dishKey: String(key), mode: batch ? "batch" : cell ? "cell" : "plain", batch, cell, portions: s.portions ?? {}, people: s.eating ?? [], servings }),
    [key, batch, cell, s.portions, s.eating, servings],
  );

  if (!plan) {
    return (
      <main className="koi-page font-koi-sans text-koi-ink">
        <p className="m-0 text-base font-semibold">KOI has no recipe for this dish yet.</p>
        <Link href="/store/plan?step=plan" className="mt-3 inline-block text-sm font-semibold text-koi-primary">Back to the week</Link>
      </main>
    );
  }

  const day = cell ? dayLabels[cell.key.split(":")[0]] : null;
  const eyebrow = batch
    ? `Batch ${batch.id} · cook on ${batch.cookLabel ?? "the prep day"} · ${batch.slot} ${batch.cells.map((c) => dayLabels[c.split(":")[0]]).filter(Boolean).join(", ")}`
    : cell ? `${day ?? "This week"} · ${cell.slot}` : "A typical home recipe";

  return (
    <>
      <RecipeView
        plan={plan}
        context={{ eyebrow, back: "/store/plan?step=plan", dayLabels }}
        unit={unit}
        onUnit={setUnit}
        servings={servings}
        onServings={plan.mode === "plain" ? setServings : null}
        onCook={() => setCooking(true)}
      />
      {cooking && <CookMode plan={plan} unit={unit} onClose={() => setCooking(false)} />}
    </>
  );
}
