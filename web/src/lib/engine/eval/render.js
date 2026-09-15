// ============================================================================
// KOI ENGINE — Drawing an evaluation label from known facts
//
// Phase 1.7. An evaluation case (./cases.js) states what a pack says; this
// draws it as an Indian back-of-pack label — name, net quantity, veg mark,
// ingredients, allergen statements, and a nutrition table in one or two
// columns — as SVG, which scripts/runEval.mjs rasterises and roughens.
//
// printedTable() is the single source of every number on the label. The
// renderer draws from it and the scorer (../evaluation.js) compares with it,
// so the truth is exactly what is printed, rounding included.
//
// Pure.
// ============================================================================

export const LABEL_WIDTH = 1000;

const FONT = "Arial, Helvetica, sans-serif";

export const STYLES = Object.freeze({
  clean: Object.freeze({ bg: "#fffdf5", fg: "#111111", muted: "#555555", rule: "#222222", size: 22, small: 18, chars: 78, leading: 1.35 }),
  dense: Object.freeze({ bg: "#ffffff", fg: "#1a1a1a", muted: "#555555", rule: "#333333", size: 16, small: 14, chars: 108, leading: 1.25 }),
  low_contrast: Object.freeze({ bg: "#efe9dc", fg: "#8a8378", muted: "#a39c90", rule: "#b3ab9d", size: 20, small: 16, chars: 86, leading: 1.3 }),
});

const escape = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const round1 = (v) => Math.round(v * 10) / 10;

/** Greedy word wrap to at most `maxChars` per line. */
export function wrap(text, maxChars) {
  const lines = [];
  let line = "";
  for (const word of String(text ?? "").split(/\s+/).filter(Boolean)) {
    if (line && line.length + 1 + word.length > maxChars) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Every figure the label prints, per printed column. Energy follows from the
 * macros (4 kcal per g of protein and carbohydrate, 9 per g of fat), so the
 * table passes the same arithmetic check a real one must.
 *
 * @param {{ columns: string[], serving: string, per100: object, energyKj?: boolean, salt?: boolean }|null} nutrition
 * @returns {{ per_100g?: object, per_serving?: object }|null}
 */
export function printedTable(nutrition) {
  if (!nutrition) return null;
  const p = nutrition.per100;
  const per100 = {
    energy_kcal: Math.round(4 * (p.protein_g + p.carbs_g) + 9 * p.total_fat_g),
    protein_g: round1(p.protein_g),
    carbs_g: round1(p.carbs_g),
    sugars_g: round1(p.sugars_g),
    fibre_g: round1(p.fibre_g),
    total_fat_g: round1(p.total_fat_g),
    saturated_fat_g: round1(p.saturated_fat_g),
    trans_fat_g: round1(p.trans_fat_g ?? 0),
  };
  if (nutrition.salt) per100.salt_g = round1((p.sodium_mg * 2.5) / 1000);
  else per100.sodium_mg = Math.round(p.sodium_mg);
  if (nutrition.energyKj) per100.energy_kj = Math.round(per100.energy_kcal * 4.184);

  const grams = parseFloat(nutrition.serving);
  const perServing = {};
  for (const [key, value] of Object.entries(per100)) {
    const scaled = (value * grams) / 100;
    perServing[key] = ["energy_kcal", "energy_kj", "sodium_mg"].includes(key) ? Math.round(scaled) : round1(scaled);
  }

  const table = {};
  if (nutrition.columns.includes("per_100g")) table.per_100g = per100;
  if (nutrition.columns.includes("per_serving")) table.per_serving = perServing;
  return table;
}

const ROWS = Object.freeze([
  ["Energy (kcal)", "energy_kcal"],
  ["Energy (kJ)", "energy_kj"],
  ["Protein (g)", "protein_g"],
  ["Carbohydrate (g)", "carbs_g"],
  ["   of which Total Sugars (g)", "sugars_g"],
  ["Dietary Fibre (g)", "fibre_g"],
  ["Total Fat (g)", "total_fat_g"],
  ["   Saturated Fat (g)", "saturated_fat_g"],
  ["   Trans Fat (g)", "trans_fat_g"],
  ["Sodium (mg)", "sodium_mg"],
  ["Salt (g)", "salt_g"],
]);

/**
 * @param {object} spec an evaluation case (./cases.js)
 * @returns {string} SVG markup
 */
export function labelSvg(spec) {
  const s = STYLES[spec.style] ?? STYLES.clean;
  const parts = [];
  let y = 60;
  const text = (x, yy, content, { size = s.size, weight = 400, fill = s.fg, anchor = "start" } = {}) =>
    parts.push(`<text x="${x}" y="${Math.round(yy)}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${escape(content)}</text>`);
  const rule = (yy, weight = 1) =>
    parts.push(`<line x1="40" y1="${Math.round(yy)}" x2="${LABEL_WIDTH - 40}" y2="${Math.round(yy)}" stroke="${s.rule}" stroke-width="${weight}"/>`);
  const paragraph = (content, opts = {}) => {
    for (const line of wrap(content, s.chars)) {
      text(40, y, line, opts);
      y += s.size * s.leading;
    }
  };

  text(40, y, spec.pack.name, { size: s.size + 10, weight: 700 });
  if (spec.pack.veg !== false) {
    parts.push(`<rect x="${LABEL_WIDTH - 80}" y="28" width="40" height="40" fill="none" stroke="#1a8f3c" stroke-width="4"/>`);
    parts.push(`<circle cx="${LABEL_WIDTH - 60}" cy="48" r="11" fill="#1a8f3c"/>`);
  }
  y += s.size * 1.5;
  text(40, y, `${spec.pack.brand}   |   Net Quantity: ${spec.pack.net}`, { size: s.small, fill: s.muted });
  y += s.small * 2.2;

  if (spec.ingredients) {
    text(40, y, "INGREDIENTS:", { weight: 700 });
    y += s.size * s.leading;
    paragraph(spec.ingredients);
    y += s.size * 0.5;
  }
  if (spec.allergenStatement) {
    text(40, y, "ALLERGEN INFORMATION:", { weight: 700 });
    y += s.size * s.leading;
    paragraph(spec.allergenStatement);
    y += s.size * 0.5;
  }
  if (spec.mayContain) {
    paragraph(spec.mayContain, { weight: 700 });
    y += s.size * 0.5;
  }

  const table = printedTable(spec.nutrition);
  if (table) {
    const columns = spec.nutrition.columns;
    const x = columns.length === 2 ? [LABEL_WIDTH - 300, LABEL_WIDTH - 50] : [LABEL_WIDTH - 50];
    y += s.size * 0.6;
    rule(y - s.size * 1.1, 3);
    text(40, y, "NUTRITIONAL INFORMATION", { weight: 700 });
    text(LABEL_WIDTH - 50, y, "(Approx. values)", { size: s.small, fill: s.muted, anchor: "end" });
    y += s.size * s.leading;
    columns.forEach((column, i) => {
      const heading = column === "per_100g" ? "Per 100 g" : `Per serving (${spec.nutrition.serving})`;
      text(x[i], y, heading, { size: s.small, weight: 700, anchor: "end" });
    });
    y += s.size * 0.5;
    rule(y, 2);
    y += s.size * s.leading;
    for (const [label, key] of ROWS) {
      if (!(key in table[columns[0]])) continue;
      text(50, y, label, { size: s.small });
      columns.forEach((column, i) => text(x[i], y, String(table[column][key]), { size: s.small, anchor: "end" }));
      y += s.small * 0.5;
      rule(y, 1);
      y += s.small * 1.3;
    }
  }

  if (spec.pack.fssai) {
    y += s.small;
    text(40, y, `FSSAI Lic. No. ${spec.pack.fssai}`, { size: s.small, fill: s.muted });
  }
  const height = Math.ceil(y + 40);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${LABEL_WIDTH}" height="${height}" viewBox="0 0 ${LABEL_WIDTH} ${height}"><rect width="${LABEL_WIDTH}" height="${height}" fill="${s.bg}"/>${parts.join("")}</svg>`;
}
