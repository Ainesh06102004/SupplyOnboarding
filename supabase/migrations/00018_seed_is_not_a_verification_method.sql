-- ============================================================================
-- KOI — 'seed' is not a verification method
--
-- The 18 mock mappings were written with match_method = 'manual', which in this
-- table's own taxonomy means "a person confirmed it". Nobody confirmed them.
-- They were generated so the mock adapter had something to resolve.
--
-- WHY A FABRICATED VALUE HERE IS WORSE THAN IT LOOKS:
-- match_method sits beside confidence and verified_at in the row that decides
-- whether KOI is confident enough to report a product's stock as the stock of
-- the product it screened. Recording an unperformed verification in that row is
-- the same defect as an invented nutrition value, in the table whose whole job
-- is to stop KOI making claims about the wrong food.
--
-- It is not currently exploitable: these rows are marketplace = 'mock', and the
-- Swiggy adapter reads marketplace = 'swiggy', so a real provider can never see
-- them. The hazard is transmission — the seed file's mock block is the line
-- someone copies when they come to write the Swiggy rows, and it would carry
-- 'manual', confidence 1.00 and a verified_at timestamp with it.
--
-- So the category gets a name. A row marked 'seed' says what it is, and
-- 'manual' goes back to meaning what it says.
-- ============================================================================

ALTER TABLE marketplace_sku_map
  DROP CONSTRAINT IF EXISTS marketplace_sku_map_match_method_check;

ALTER TABLE marketplace_sku_map
  ADD CONSTRAINT marketplace_sku_map_match_method_check
  CHECK (match_method = ANY (ARRAY['manual','barcode','name_pack','observed','seed']));

UPDATE marketplace_sku_map
   SET match_method = 'seed'
 WHERE marketplace = 'mock' AND match_method = 'manual';

COMMENT ON COLUMN marketplace_sku_map.match_method IS
  'How the mapping was established, which is what makes a wrong one auditable. barcode = matched on EAN, the only genuinely reliable method. name_pack = normalised name plus pack size, needs review. observed = discovered from a search result; never self-promotes to trusted. manual = a person confirmed it. seed = generated so a non-production adapter has something to resolve; nobody confirmed it, and it must never appear on a real provider row.';
