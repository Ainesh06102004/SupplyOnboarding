// ============================================================================
// KOI — Zone lookup
//
// SERVER ONLY. Resolves a shopper's pincode to a KOI zone and, with it, the
// provider address the catalogue must be queried against.
//
// WHY THIS EXISTS AT ALL: Swiggy has no pincode API. `search_products` takes an
// `addressId` from `get_addresses`, and addresses belong to an authenticated
// user — so "what is available near this pincode" is not a question the
// provider answers. KOI has to maintain the mapping itself, which is what
// marketplace_zone and marketplace_zone_pincode are.
//
// The many-to-one collapse is the point: ~19,000 Indian pincodes share a few
// dozen dark-store catchments per city, and the cache is keyed on the zone.
//
// `address_ref` NEVER leaves the server. It is a handle on a KOI-owned Swiggy
// address, and a shopper has no business seeing another zone's.
// ============================================================================

import "server-only";

import { getServiceClient } from "@/lib/supabase/admin";
import { SERVICEABILITY } from "./types";

/**
 * @param {string} marketplace
 * @param {string} pincode
 * @returns {Promise<{zoneId: string, label: string, addressRef: string|null,
 *                    serviceability: string, credentialScope: string}|null>}
 */
export async function resolveZoneByPincode(marketplace, pincode) {
  const supabase = getServiceClient();
  if (!supabase || !marketplace || !pincode) return null;

  const { data, error } = await supabase
    .from("marketplace_zone_pincode")
    .select("zone_id, marketplace_zone (zone_id, label, address_ref, serviceability, credential_scope)")
    .eq("marketplace", marketplace)
    .eq("pincode", String(pincode))
    .maybeSingle();

  if (error || !data?.marketplace_zone) return null;

  const z = data.marketplace_zone;
  return {
    zoneId: z.zone_id,
    label: z.label,
    addressRef: z.address_ref ?? null,
    serviceability: z.serviceability ?? SERVICEABILITY.UNKNOWN,
    credentialScope: z.credential_scope ?? "house",
  };
}

/**
 * The provider address a zone is queried against.
 *
 * Null means the zone exists but has no provider address attached yet — the
 * catalogue genuinely cannot be queried for it, which resolves to `unknown`
 * rather than to "not serviceable". KOI not having wired an address up is not
 * evidence that Swiggy does not deliver there.
 */
export async function addressRefForZone(marketplace, zoneId) {
  const supabase = getServiceClient();
  if (!supabase || !zoneId) return null;

  const { data, error } = await supabase
    .from("marketplace_zone")
    .select("address_ref")
    .eq("marketplace", marketplace)
    .eq("zone_id", zoneId)
    .maybeSingle();

  if (error || !data) return null;
  return data.address_ref ?? null;
}
