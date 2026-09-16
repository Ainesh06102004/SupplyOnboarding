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
    remotePatterns: supabaseHost
      ? [{ protocol: 'https', hostname: supabaseHost }]
      : [],
  },
}

export default nextConfig
