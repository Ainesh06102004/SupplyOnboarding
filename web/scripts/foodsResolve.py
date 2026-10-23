"""Resolve foods.source.json against the IFCT 2017 extract into the repo's foods.json.

IFCT energy (enerc) is in kJ; kcal = kJ / 4.184. Carbohydrate is IFCT's available
carbohydrate (choavldf), so fibre is separate. Oils/ghee carry no energy in the
corpus: their kcal is fat x 37 kJ/g, IFCT's own factor, / 4.184.
"""
import json, sys

ifct_path, src_path, out_path = sys.argv[1], sys.argv[2], sys.argv[3]
rows = {r["code"]: r for r in json.load(open(ifct_path, encoding="utf-8"))}
if "--oils" in sys.argv:
    for c, r in rows.items():
        if c.startswith("T"):
            print(c, r["name"], r["enerc"], r["fatce"])
    sys.exit(0)

src = json.load(open(src_path, encoding="utf-8"))
out, bad = [], []
for f in src:
    item = {"key": f["key"], "name": f["name"]}
    if "ifct" in f:
        r = rows.get(f["ifct"])
        if not r:
            bad.append(f"{f['key']}: no IFCT code {f['ifct']}")
            continue
        fat = r["fatce"] or 0.0
        if f.get("kcalFromFat"):
            kcal = round(fat * 37 / 4.184)
        else:
            if r["enerc"] is None:
                bad.append(f"{f['key']}: IFCT {f['ifct']} has no energy")
                continue
            kcal = round(r["enerc"] / 4.184)
        item["per100"] = {
            "kcal": kcal,
            "protein": round(r["protcnt"] or 0.0, 2),
            "carbs": round(r["choavldf"] or 0.0, 2),
            "fat": round(fat, 2),
            "fibre": round(r["fibtg"] or 0.0, 2),
        }
        item["source"] = "ifct_2017"
        item["sourceRef"] = f"{f['ifct']} {r['name']}"
    else:
        item["per100"] = f["per100"]
        item["source"] = f["source"]
        item["sourceRef"] = f["ref"]
    if "fridge" in f: item["fridgeDays"] = f["fridge"]
    if "yield" in f: item["cookedYield"] = f["yield"]
    if "m" in f: item["measures"] = f["m"]
    if "piece" in f: item["pieceName"] = f["piece"]
    if f.get("pieceIsName"): item["pieceIsName"] = True
    out.append(item)

if bad:
    print("\n".join(bad))
    sys.exit(1)
keys = [o["key"] for o in out]
dup = {k for k in keys if keys.count(k) > 1}
if dup:
    print("duplicate keys", dup)
    sys.exit(1)
import hashlib
body = json.dumps(out, ensure_ascii=False, indent=1)
version = hashlib.sha256(body.encode("utf-8")).hexdigest()[:12]
header = """// GENERATED from the Indian Food Composition Tables 2017 (ICMR-NIN) and cited
// references. Do not edit by hand: change the source list and regenerate.
//
// One row per food a recipe line can be sized with: figures per 100 g edible
// portion, raw. IFCT energy is kJ / 4.184; carbs are IFCT's available
// carbohydrate, so fibre is separate. Oils carry IFCT's 37 kJ per g of fat.
// `source` says where each row comes from: ifct_2017 (with its food code),
// usda_fdc, icmr_nvif_1989, or koi_estimate (a typical label, to be replaced by
// the product's own label wherever KOI sells it).
"""
NL = chr(10)
with open(out_path, "w", encoding="utf-8", newline=NL) as fh:
    fh.write(header + NL + f'export const FOOD_VERSION = "{version}";' + NL + NL + f"export const FOODS = Object.freeze({body});" + NL)
print(len(out), "foods written", version)
