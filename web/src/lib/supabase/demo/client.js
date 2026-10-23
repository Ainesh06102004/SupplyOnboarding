// ============================================================================
// Demo mode's Supabase client: the calls supabase-js takes, turned into plain
// query descriptions and sent to the demo database (engine.js, behind
// /api/demo/db). Runs in the browser and on the server; only `send` differs.
//
// Auth is the demo shopper (mode.js): always signed in, unless they sign out
// in this browser; signing in again takes any phone and any code.
// ============================================================================

import { DEMO_USER, DEMO_SESSION } from "./mode";

const SIGNED_OUT_KEY = "koi_demo_signed_out";

class Query {
  constructor(send, table, schema = null) {
    this.send = send;
    this.q = { table, schema, op: "select", select: null, filters: [], orders: [] };
  }
  select(columns = "*", opts = {}) {
    if (this.q.op === "select") this.q.select = columns;
    else { this.q.returning = true; this.q.select = columns; }
    if (opts.count) this.q.count = opts.count;
    if (opts.head) this.q.head = true;
    return this;
  }
  insert(values) { this.q.op = "insert"; this.q.values = values; return this; }
  upsert(values, opts = {}) { this.q.op = "upsert"; this.q.values = values; this.q.onConflict = opts.onConflict ?? null; this.q.ignoreDuplicates = Boolean(opts.ignoreDuplicates); return this; }
  update(values) { this.q.op = "update"; this.q.values = values; return this; }
  delete() { this.q.op = "delete"; return this; }
  filter(col, op, val) { this.q.filters.push([op, col, val]); return this; }
  eq(c, v) { return this.filter(c, "eq", v); }
  neq(c, v) { return this.filter(c, "neq", v); }
  gt(c, v) { return this.filter(c, "gt", v); }
  gte(c, v) { return this.filter(c, "gte", v); }
  lt(c, v) { return this.filter(c, "lt", v); }
  lte(c, v) { return this.filter(c, "lte", v); }
  in(c, v) { return this.filter(c, "in", [...(v ?? [])]); }
  is(c, v) { return this.filter(c, "is", v); }
  like(c, v) { return this.filter(c, "like", v); }
  ilike(c, v) { return this.filter(c, "ilike", v); }
  contains(c, v) { return this.filter(c, "contains", v); }
  not(c, op, v) { return this.filter(c, "not", [op, v]); }
  or(expr) { this.q.filters.push(["or", expr, null]); return this; }
  match(obj) { for (const [c, v] of Object.entries(obj ?? {})) this.eq(c, v); return this; }
  order(col, { ascending = true, nullsFirst = null } = {}) { this.q.orders.push([col, ascending, nullsFirst]); return this; }
  limit(n) { this.q.limit = n; return this; }
  range(from, to) { this.q.range = [from, to]; return this; }
  single() { this.q.single = "one"; return this; }
  maybeSingle() { this.q.single = "maybe"; return this; }
  abortSignal() { return this; }
  returns() { return this; }
  throwOnError() { return this; }
  then(resolve, reject) {
    return this.send(this.q).then(({ data = null, error = null, count = null }) => ({ data, error, count, status: error ? 400 : 200 })).then(resolve, reject);
  }
}

/**
 * @param {{ send: (q) => Promise<{data, error, count}>, browser?: boolean }} opts
 */
export function createDemoClient({ send, browser = false }) {
  const listeners = new Set();
  const signedIn = () => {
    if (!browser) return true;
    try { return window.localStorage.getItem(SIGNED_OUT_KEY) !== "1"; } catch { return true; }
  };
  const setSignedIn = (on) => {
    if (!browser) return;
    try { if (on) window.localStorage.removeItem(SIGNED_OUT_KEY); else window.localStorage.setItem(SIGNED_OUT_KEY, "1"); } catch { /* this visit only */ }
  };
  const emit = (event) => { for (const cb of listeners) cb(event, signedIn() ? DEMO_SESSION : null); };
  const signIn = async () => { setSignedIn(true); emit("SIGNED_IN"); return { data: { user: DEMO_USER, session: DEMO_SESSION }, error: null }; };

  const auth = {
    getUser: async () => ({ data: { user: signedIn() ? DEMO_USER : null }, error: null }),
    getSession: async () => ({ data: { session: signedIn() ? DEMO_SESSION : null }, error: null }),
    onAuthStateChange(cb) {
      listeners.add(cb);
      setTimeout(() => cb("INITIAL_SESSION", signedIn() ? DEMO_SESSION : null), 0);
      return { data: { subscription: { unsubscribe: () => listeners.delete(cb) } } };
    },
    signInWithOtp: async () => ({ data: {}, error: null }),
    verifyOtp: signIn,
    signInWithPassword: signIn,
    signUp: signIn,
    signInWithOAuth: signIn,
    exchangeCodeForSession: async () => ({ data: { session: DEMO_SESSION, user: DEMO_USER }, error: null }),
    refreshSession: async () => ({ data: { session: DEMO_SESSION, user: DEMO_USER }, error: null }),
    signOut: async () => { setSignedIn(false); emit("SIGNED_OUT"); return { error: null }; },
    admin: { getUserById: async () => ({ data: { user: DEMO_USER }, error: null }) },
  };

  return {
    demo: true,
    auth,
    from: (table) => new Query(send, table),
    schema: (schema) => ({ from: (table) => new Query(send, table, schema) }),
    rpc: (fn, args = {}) => {
      const p = send({ rpc: fn, args });
      return Object.assign(p.then(({ data = null, error = null }) => ({ data, error })), { single: () => p.then(({ data = null, error = null }) => ({ data, error })) });
    },
    channel: () => ({ on() { return this; }, subscribe() { return this; }, unsubscribe() {} }),
    removeChannel: () => {},
  };
}
