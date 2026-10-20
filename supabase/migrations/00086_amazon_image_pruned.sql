-- ============================================================================
-- KOI — Amazon images: remember which stored copies were pruned (20 Oct 2026)
--
-- The protein-bar scrape (scripts/amazon/images.mjs) copied every listing image
-- into the private amazon-products bucket: 18,501 files, 2.41 GB, on a Free
-- plan with 1 GB of storage. Only the panel photos are ever read (kind in
-- nutrition / label / ingredients, by scripts/amazon/labels.mjs); packshots and
-- description banners never are, and nothing in the app shows them.
--
-- scripts/amazon/prune.mjs deletes those copies through the Storage API and
-- marks the row here. The row keeps its amazon_url, sha256, size and kind, so
-- the image is still known and can be fetched again; images.mjs skips a pruned
-- row instead of re-downloading it.
-- ============================================================================

alter table amazon_products.image add column if not exists pruned_at timestamptz;

comment on column amazon_products.image.pruned_at is
  'When the stored copy was deleted to save storage (scripts/amazon/prune.mjs). storage_path is null after that; amazon_url still points at the source.';
