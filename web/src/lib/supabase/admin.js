// ============================================================================
// KOI — Service-role Supabase client
//
// SERVER ONLY. The `server-only` import makes importing this from a client
// component a build error rather than a runtime catastrophe: this client
// bypasses RLS entirely, so it must never reach a bundle.
//
// Use it ONLY for data that is service-role by design — the marketplace tier
// (`marketplace_sku_map`, `marketplace_zone`, `marketplace_credentials`),
// which holds provider-derived integration keys the browser has no business
// reading. Everything user-owned goes through the anon client, where RLS is
// the floor. Reaching for this client to "make a query work" deletes defence
// in depth for the whole table.
//
// Returns null when unconfigured rather than throwing. A missing service key
// is a deployment state, not a bug in the request being served: callers
// degrade to `unknown`, which is true — without the key, KOI genuinely cannot
// look up what it knows.
// ============================================================================

import "server-only";

import { createClient } from "@supabase/supabase-js";

let client = null;
let warned = false;

/**
 * @returns {import('@supabase/supabase-js').SupabaseClient|null}
 */
export function getServiceClient() {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    if (!warned) {
      warned = true;
      console.warn(
        "SUPABASE_SERVICE_ROLE_KEY is not set — marketplace SKU mappings cannot be read, " +
          "so every product resolves to `unknown` availability. Add it to .env.local to enable supply lookups."
      );
    }
    return null;
  }

  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
