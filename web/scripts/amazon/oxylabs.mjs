// Thin client for the Oxylabs Web Scraper API (realtime), amazon.in only.
// Run scripts from web/ with --env-file=.env.local (OXYLABS_USERNAME / OXYLABS_PASSWORD).

export const DOMAIN = "in";
export const PINCODE = process.env.AMAZON_PINCODE || "110001";

const ENDPOINT = "https://realtime.oxylabs.io/v1/queries";
const user = process.env.OXYLABS_USERNAME;
const pass = process.env.OXYLABS_PASSWORD;
if (!user || !pass) {
  console.error("Missing OXYLABS_USERNAME / OXYLABS_PASSWORD. Run with --env-file=.env.local from web/.");
  process.exit(1);
}
const auth = "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");

export let calls = 0;

// One request. Retries on 429/5xx/network with backoff. Returns results[0].content (parsed).
export async function query(body, { tries = 4 } = {}) {
  const payload = { domain: DOMAIN, geo_location: PINCODE, parse: true, ...body };
  for (let attempt = 1; ; attempt++) {
    try {
      calls++;
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { Authorization: auth, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(180_000),
      });
      if (res.status === 401 || res.status === 403) throw Object.assign(new Error(`oxylabs ${res.status}: ${await res.text()}`), { fatal: true });
      if (!res.ok) throw new Error(`oxylabs ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const json = await res.json();
      const result = json.results?.[0];
      if (!result) throw new Error("oxylabs: no results");
      return result.content;
    } catch (err) {
      if (err.fatal || attempt >= tries) throw err;
      await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
    }
  }
}

// Retries a model call on rate limits (429 / "Rate limit") and timeouts, with backoff.
export async function withRateLimit(fn, tries = 8) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const limited = /rate limit|429|timed out|timeout|abort/i.test(err.message || "");
      if (!limited || attempt >= tries) throw err;
      await new Promise((r) => setTimeout(r, Math.min(60_000, 3000 * 2 ** (attempt - 1)) + Math.random() * 2000));
    }
  }
}

// Runs fn over items with a fixed number of workers.
export async function pool(items, workers, fn) {
  let next = 0;
  const run = async () => {
    while (next < items.length) {
      const i = next++;
      try {
        await fn(items[i], i);
      } catch (err) {
        console.error(`  ! ${JSON.stringify(items[i]).slice(0, 80)}: ${err.message.slice(0, 200)}`);
      }
    }
  };
  await Promise.all(Array.from({ length: workers }, run));
}
