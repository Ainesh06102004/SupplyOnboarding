-- ============================================================================
-- KOI — Delhi, the launch zone
--
-- Swiggy has no pincode API. `search_products` takes an `addressId` belonging
-- to an authenticated account, so "what is available near this pincode" is not
-- a question the provider answers — KOI maintains the mapping, and that is what
-- marketplace_zone and marketplace_zone_pincode are.
--
-- WHY ONE ZONE PER CITY:
-- `address_ref` is a handle on a KOI-owned Swiggy address, and KOI will hold one
-- per city. The table's grain should match the thing that populates it. If
-- spinId or availability turns out to vary per dark store, that is
-- scope='store' ROWS in marketplace_sku_map — no DDL, no resolver change. Start
-- coarse; split only when there is evidence that splitting changes an answer.
--
-- WHY address_ref IS NULL AND serviceability IS 'unknown':
-- KOI has no Swiggy credential yet, so there is no house address to point at.
-- Null is the honest value and it fails in the right direction: the adapter
-- resolves the zone, finds no address, and answers `unknown` rather than
-- claiming stock. It does NOT mean "Swiggy does not deliver to Delhi" — that is
-- 'not_serviceable', a claim about Swiggy this absence cannot support.
--
-- When credentials arrive this becomes an UPDATE of one column, not a design
-- exercise. That is the whole point of seeding it now.
--
-- 110001-110096 is Delhi's standard range. Pincodes outside it resolve to no
-- zone, which is also `unknown` — KOI has not mapped there yet.
-- ============================================================================

INSERT INTO marketplace_zone
  (zone_id, marketplace, label, address_ref, credential_scope, serviceability)
VALUES
  ('swiggy-delhi', 'swiggy', 'Delhi', NULL, 'house', 'unknown')
ON CONFLICT (zone_id) DO UPDATE SET label = EXCLUDED.label;

INSERT INTO marketplace_zone_pincode (marketplace, pincode, zone_id)
SELECT 'swiggy', lpad(g::text, 6, '0'), 'swiggy-delhi'
FROM generate_series(110001, 110096) g
ON CONFLICT DO NOTHING;

-- When the house credential exists, this is the only line that has to change:
--
--   UPDATE marketplace_zone
--      SET address_ref = '<addressId from get_addresses>',
--          serviceability = 'serviceable'
--    WHERE zone_id = 'swiggy-delhi';
--
-- Set serviceability from what Swiggy actually answered, not from optimism.


-- ── Check ───────────────────────────────────────────────────────────────────
-- SELECT z.zone_id, z.label, z.address_ref, z.serviceability, count(p.pincode)
-- FROM marketplace_zone z
-- LEFT JOIN marketplace_zone_pincode p ON p.zone_id = z.zone_id
-- GROUP BY z.zone_id, z.label, z.address_ref, z.serviceability;
