import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// The Supabase project host, taken from the configured URL rather than pinned,
// so pointing at a different project needs no code change.
const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : null

/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    root: __dirname,
  },
  // The planner's solver (lib/planner/solve.js) is HiGHS compiled to
  // WebAssembly. Bundled, its paths become virtual `[project]/...` ones and
  // the .wasm beside it cannot be read, so /api/plan failed with ENOENT in the
  // app while every script passed. Loaded with Node's own require, the
  // package finds its .wasm where it is installed.
  serverExternalPackages: ['highs'],
  images: {
    // Derived from the configured project so a new Supabase ref does not
    // silently break every remote image. Falls back to none when unset.
    //
    // images.openfoodfacts.org serves the contributors' pack photographs, which
    // the local test catalogue hot-links (scripts/buildTestCatalogue.mjs). They
    // are CC-BY-SA, credited wherever they are shown, and only ever reachable
    // with NEXT_PUBLIC_KOI_TEST_CATALOGUE=open_food_facts.
    remotePatterns: [
      ...(supabaseHost ? [{ protocol: 'https', hostname: supabaseHost }] : []),
      { protocol: 'https', hostname: 'images.openfoodfacts.org' },
      { protocol: 'https', hostname: 'world.openfoodfacts.org' },
    ],
  },
}

export default nextConfig
