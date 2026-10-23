// Print recipes as a cook would read them, to review the editorial batches.
//   node --import ./scripts/testAlias.mjs scripts/previewRecipes.mjs [dishKey…] [--scale 4] [--grams]
import { RECIPES } from "@/lib/food/recipes/index";
import { recipeFor, dishNutrition, renderText, lineText } from "@/lib/food/recipes";
import { roundNutrients } from "@/lib/food/foods";

const args = process.argv.slice(2);
const scaleAt = args.indexOf("--scale");
const scale = scaleAt >= 0 ? Number(args[scaleAt + 1]) : 1;
const unit = args.includes("--grams") ? "grams" : "kitchen";
const keys = args.filter((a, i) => !a.startsWith("--") && !(scaleAt >= 0 && i === scaleAt + 1));

for (const key of keys.length ? keys : Object.keys(RECIPES)) {
  const r = recipeFor(key);
  if (!r) { console.log(`# ${key}: no recipe`); continue; }
  const n = roundNutrients(dishNutrition(r, { scale }));
  console.log(`\n# ${r.name} ×${scale} — ${n.kcal} kcal · P ${n.protein} · C ${n.carbs} · F ${n.fat}`);
  console.log(r.lines.map((l) => { const t = lineText(l, { scale, unit }); return `  - ${t.amount}${t.name ? ` ${t.name}` : ""}${l.optional ? " (optional)" : ""}`; }).join("\n"));
  for (const s of r.steps) console.log(`  ${s.n}. ${s.title}: ${renderText(s.text, r, { scale, unit })}`);
}
