// ============================================================================
// npm run dev:demo [-- -p 3000] — the dev server in demo mode.
//
// Every page, signed in as a demo household, with no Supabase: the app talks to
// a local stand-in that keeps its tables in web/.demo/db.json (see
// src/lib/supabase/demo). "Demo · reset" in the header starts it again.
// Demo mode is development-only; a production build ignores it.
// ============================================================================

import { spawn } from "node:child_process";

const child = spawn("npx", ["next", "dev", ...process.argv.slice(2)], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: { ...process.env, NEXT_PUBLIC_KOI_DEMO: "1" },
});
child.on("exit", (code) => process.exit(code ?? 0));
