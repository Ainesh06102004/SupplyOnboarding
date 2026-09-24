// Raw Oxylabs responses on disk, one JSON file each, so a run can resume and
// the loader can re-parse without scraping again. Outside the repo by default.
import { mkdirSync, existsSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export const CACHE = process.env.AMAZON_CACHE_DIR || "C:/Users/TUF/Desktop/KOI/amazon-cache";

const dir = (kind) => {
  const d = join(CACHE, kind);
  mkdirSync(d, { recursive: true });
  return d;
};
const safe = (key) => key.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 180);

export const has = (kind, key) => existsSync(join(dir(kind), `${safe(key)}.json`));
export const read = (kind, key) => JSON.parse(readFileSync(join(dir(kind), `${safe(key)}.json`), "utf8"));
export const write = (kind, key, value) =>
  writeFileSync(join(dir(kind), `${safe(key)}.json`), JSON.stringify({ fetched_at: new Date().toISOString(), ...value }));
export const all = (kind) =>
  readdirSync(dir(kind)).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(join(dir(kind), f), "utf8")));
