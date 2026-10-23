import csv, sys, json
src = sys.argv[1]
out = sys.argv[2]
rows = []
with open(src, encoding="utf-8") as f:
    r = csv.reader(f)
    head = next(r)
    idx = {h.split("; ")[-1]: i for i, h in enumerate(head)}
    for row in r:
        def num(k):
            v = row[idx[k]].strip()
            try:
                return float(v)
            except ValueError:
                return None
        rows.append({
            "code": row[idx["code"]], "name": row[idx["name"]], "grup": row[idx["grup"]],
            "lang": row[idx["lang"]][:80],
            "enerc": num("enerc"), "protcnt": num("protcnt"), "choavldf": num("choavldf"),
            "fatce": num("fatce"), "fibtg": num("fibtg"), "water": num("water"),
        })
with open(out, "w", encoding="utf-8") as f:
    json.dump(rows, f, ensure_ascii=False, indent=0)
print(len(rows), "foods")
for x in rows[:3]:
    print(x)
