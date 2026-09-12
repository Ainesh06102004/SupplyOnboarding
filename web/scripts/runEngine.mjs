// ============================================================================
// KOI - Run the label reader until nothing is left to read
//
// The scheduled run (/api/engine/run, daily on Vercel) reads two photos per
// call. This calls it repeatedly against a running server, for the first
// backlog or after a batch of brand uploads.
//
// Usage, from web/, with the app running:
//   node --env-file=.env.local scripts/runEngine.mjs http://localhost:3000
// ============================================================================

const base = (process.argv[2] || "").replace(/\/$/, "");
const secret = process.env.CRON_SECRET;

if (!/^https?:\/\//.test(base)) {
  console.error("Usage: node --env-file=.env.local scripts/runEngine.mjs <app origin, e.g. http://localhost:3000>");
  process.exit(1);
}
if (!secret) {
  console.error("CRON_SECRET is not set in .env.local.");
  process.exit(1);
}

for (let round = 1; round <= 50; round += 1) {
  const res = await fetch(`${base}/api/engine/run`, { headers: { Authorization: `Bearer ${secret}` } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(`Stopped: ${res.status} ${body.error || ""}`);
    process.exit(1);
  }
  for (const r of body.results || []) {
    console.log(r.error
      ? `failed    ${r.uploadId}: ${r.error}`
      : `read      ${r.uploadId}: published ${r.published.join(", ") || "nothing"}${r.blocked.length ? `; blocked ${r.blocked.map((b) => b.group).join(", ")}` : ""}`);
  }
  if (!body.attempted || !body.remaining) {
    console.log(`\nDone. ${body.remaining ?? 0} photo(s) left unread.`);
    break;
  }
}
