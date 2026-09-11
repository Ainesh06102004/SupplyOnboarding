// ============================================================================
// KOI - Grant (or revoke) the label-reviewer role
//
// A reviewer is a Supabase Auth user with app_metadata.koi_role = "reviewer".
// app_metadata can only be written with the service role, which is why this is
// a script run by someone holding that key and not a button in the app: a
// reviewer decides what KOI tells shoppers about allergens, so the role cannot
// be something an account grants itself.
//
// The account must exist first — sign in once at /login.
// Takes effect on the account's next request: the app reads the role through
// auth.getUser(), which asks the Auth server rather than trusting the token.
//
// Usage, from web/:
//   node --env-file=.env.local scripts/grantReviewer.mjs someone@example.com
//   node --env-file=.env.local scripts/grantReviewer.mjs someone@example.com --revoke
// ============================================================================

const email = (process.argv[2] || "").trim().toLowerCase();
const revoke = process.argv.includes("--revoke");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!email || !email.includes("@")) {
  console.error("Usage: node --env-file=.env.local scripts/grantReviewer.mjs <email> [--revoke]");
  process.exit(1);
}
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Run with --env-file=.env.local from web/.");
  process.exit(1);
}

const AUTH = `${SUPABASE_URL.replace(/\/$/, "")}/auth/v1/admin/users`;
const HEADERS = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json" };

async function findUser() {
  for (let page = 1; page <= 20; page += 1) {
    const res = await fetch(`${AUTH}?page=${page}&per_page=200`, { headers: HEADERS });
    if (!res.ok) throw new Error(`Listing users failed: ${res.status} ${await res.text()}`);
    const { users = [] } = await res.json();
    const hit = users.find((u) => (u.email || "").toLowerCase() === email);
    if (hit || users.length < 200) return hit || null;
  }
  return null;
}

const user = await findUser();
if (!user) {
  console.error(`No KOI account uses ${email}. Sign in once at /login, then run this again.`);
  process.exit(1);
}

const res = await fetch(`${AUTH}/${user.id}`, {
  method: "PUT",
  headers: HEADERS,
  body: JSON.stringify({ app_metadata: { ...(user.app_metadata || {}), koi_role: revoke ? null : "reviewer" } }),
});
if (!res.ok) {
  console.error(`Update failed: ${res.status} ${await res.text()}`);
  process.exit(1);
}

console.log(revoke ? `Revoked the reviewer role from ${email}.` : `${email} can now review labels at /staff/review.`);
