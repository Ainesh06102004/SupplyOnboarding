"use client";

// ============================================================================
// KOI STAFF — Label engine console
//
// Optional. The engine publishes on its own when two independent readings of
// a label agree and every check passes (lib/engine/autopublish.js); nothing
// here has to be done for the storefront to fill in. This page shows what did
// NOT publish and why — a disagreement, a failed check, a photo of the wrong
// product — for anyone who chooses to fix it. A fix made here is recorded as a
// person's verification, which outranks a machine reading.
//
// Talks only to /api/engine/review, which re-checks the reviewer role on every
// call and records the signed-in reviewer against each decision.
// ============================================================================

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Check, X, Minus, ScanText, RefreshCw, Upload } from "lucide-react";
import { ALLERGEN_FLAGS } from "@/lib/engine/checks";
import { NUTRIENT_FIELDS } from "@/lib/engine/labelSchema";
import { FOODS_AVOID } from "@/lib/recommendation/config";

const FOREST = "#083D2D";
const HEADING = { fontFamily: "var(--font-koi-heading)" };

const FLAG_LABEL = Object.fromEntries(
  ALLERGEN_FLAGS.map((flag) => [flag, (FOODS_AVOID.find((a) => a.flag === flag) || {}).label || flag]),
);
const FIELD_LABEL = {
  energy_kcal: "Energy (kcal)", protein_g: "Protein (g)", carbs_g: "Carbohydrate (g)", sugars_g: "Total sugars (g)",
  added_sugar_g: "Added sugar (g)", fibre_g: "Fibre (g)", total_fat_g: "Total fat (g)", saturated_fat_g: "Saturated fat (g)",
  trans_fat_g: "Trans fat (g)", sodium_mg: "Sodium (mg)", cholesterol_mg: "Cholesterol (mg)",
};
const GROUP_TITLE = { identity: "Is this the product?", ingredients: "Ingredient list", allergens: "Allergens", nutrition: "Nutrition table" };
const STATUS_STYLE = {
  pending: "bg-amber-50 text-amber-800 border-amber-200",
  accepted: "bg-emerald-50 text-emerald-800 border-emerald-200",
  corrected: "bg-sky-50 text-sky-800 border-sky-200",
  rejected: "bg-rose-50 text-rose-800 border-rose-200",
  superseded: "bg-gray-100 text-gray-600 border-gray-200",
};

/** A printed list split at top-level commas, keeping "(...)" with its parent. */
const splitIngredients = (text) =>
  String(text || "").split(/,(?![^()]*\))/).map((s) => s.trim()).filter(Boolean).map((name) => {
    const m = name.match(/\((\d+(?:\.\d+)?)\s*%\)\s*$/);
    return { name, percent: m ? Number(m[1]) : null };
  });

async function api(method, body, query = "") {
  const res = await fetch(`/api/engine/review${query}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function Actions({ onAccept, onCorrect, onReject, busy, canCorrect = true }) {
  const base = "rounded-full px-3.5 py-1.5 text-[12.5px] font-bold transition-opacity disabled:opacity-40";
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      <button type="button" disabled={busy} onClick={onAccept} className={`${base} bg-[#083D2D] text-white`}>Accept as read</button>
      {canCorrect && <button type="button" disabled={busy} onClick={onCorrect} className={`${base} border border-[#083D2D]/25 bg-white text-[#083D2D]`}>Save correction</button>}
      <button type="button" disabled={busy} onClick={onReject} className={`${base} border border-rose-200 bg-white text-rose-700`}>Reject</button>
    </div>
  );
}

function GroupCard({ item, busy, onDecide }) {
  const initial = item.decision ?? item.proposed;
  const [text, setText] = useState(initial.raw_ingredient_text ?? "");
  const [contains, setContains] = useState(initial.contains ?? []);
  const [mayContain, setMayContain] = useState(initial.may_contain ?? []);
  const [panel, setPanel] = useState(() => ({
    measurement_basis: initial.measurement_basis ?? "per_100g",
    serving_size: initial.serving_size ?? "",
    servings_per_pack: initial.servings_per_pack ?? "",
    ...Object.fromEntries(NUTRIENT_FIELDS.map((f) => [f, initial[f] ?? ""])),
  }));

  const toggle = (list, setList, flag) => setList(list.includes(flag) ? list.filter((f) => f !== flag) : [...list, flag]);
  const num = (v) => (v === "" || v === null || v === undefined ? null : Number(v));

  const correction = () => {
    if (item.field_group === "ingredients") return { raw_ingredient_text: text, parsed_ingredients: splitIngredients(text) };
    if (item.field_group === "allergens") return { contains, may_contain: mayContain };
    if (item.field_group === "nutrition") {
      return {
        measurement_basis: panel.measurement_basis,
        serving_size: panel.serving_size || null,
        servings_per_pack: num(panel.servings_per_pack),
        ...Object.fromEntries(NUTRIENT_FIELDS.map((f) => [f, num(panel[f])])),
      };
    }
    return item.proposed;
  };

  const id = (suffix) => `${item.id}-${suffix}`;

  return (
    <section className="rounded-2xl border border-[#083D2D]/10 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[16px] font-extrabold text-[#083D2D]" style={HEADING}>{GROUP_TITLE[item.field_group]}</h3>
        <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${STATUS_STYLE[item.status]}`}>{item.status}</span>
      </div>
      <p className="mt-1 text-[12.5px] text-[#101412]/60">{item.route_reason}</p>

      {item.field_group === "identity" && (
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[13.5px]">
          {[["Name on pack", initial.product_name], ["Brand", initial.brand], ["Net quantity", initial.net_quantity], ["Veg mark", initial.veg_mark], ["FSSAI licence", initial.fssai_licence]].map(([k, v]) => (
            <React.Fragment key={k}><dt className="text-[#101412]/55">{k}</dt><dd className="font-semibold">{v ?? "—"}</dd></React.Fragment>
          ))}
        </dl>
      )}

      {item.field_group === "ingredients" && (
        <div className="mt-3">
          <label htmlFor={id("text")} className="text-[12px] font-bold uppercase tracking-wide text-[#101412]/55">As printed</label>
          <textarea id={id("text")} value={text} onChange={(e) => setText(e.target.value)} rows={5}
            className="mt-1 w-full rounded-xl border border-[#083D2D]/15 p-3 text-[13.5px] leading-relaxed focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0C6B4C]" />
          <p className="mt-1 text-[12px] text-[#101412]/55">{splitIngredients(text).length} ingredients, split at top-level commas.</p>
        </div>
      )}

      {item.field_group === "allergens" && (
        <div className="mt-3 space-y-3 text-[13.5px]">
          <p><span className="text-[#101412]/55">Statement: </span>{item.proposed.statement || <em className="text-rose-700">none read</em>}</p>
          {item.proposed.may_contain_statement && <p><span className="text-[#101412]/55">May contain: </span>{item.proposed.may_contain_statement}</p>}
          {[["Contains", contains, setContains], ["May contain", mayContain, setMayContain]].map(([title, list, setList]) => (
            <fieldset key={title}>
              <legend className="text-[12px] font-bold uppercase tracking-wide text-[#101412]/55">{title}</legend>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {ALLERGEN_FLAGS.map((flag) => (
                  <label key={flag} className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-[12.5px] font-semibold ${list.includes(flag) ? "border-[#083D2D] bg-[#083D2D] text-white" : "border-[#083D2D]/20 bg-white text-[#083D2D]"}`}>
                    <input type="checkbox" className="sr-only" checked={list.includes(flag)} onChange={() => toggle(list, setList, flag)} />
                    {FLAG_LABEL[flag]}
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
          <p className="text-[12px] text-[#101412]/55">Proposed from the ingredient list: {item.proposed.from_text?.map((f) => FLAG_LABEL[f]).join(", ") || "none"}; from the statement: {item.proposed.from_statement?.map((f) => FLAG_LABEL[f]).join(", ") || "none"}.</p>
        </div>
      )}

      {item.field_group === "nutrition" && (
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="text-[12px] font-bold text-[#101412]/60" htmlFor={id("basis")}>Basis
            <select id={id("basis")} value={panel.measurement_basis} onChange={(e) => setPanel({ ...panel, measurement_basis: e.target.value })}
              className="mt-1 block w-full rounded-lg border border-[#083D2D]/15 bg-white p-2 text-[13.5px] font-medium">
              <option value="per_100g">per 100 g</option><option value="per_100ml">per 100 ml</option><option value="per_serving">per serving</option>
            </select>
          </label>
          {[["serving_size", "Serving size", "text"], ["servings_per_pack", "Servings per pack", "number"]].map(([key, label, type]) => (
            <label key={key} className="text-[12px] font-bold text-[#101412]/60" htmlFor={id(key)}>{label}
              <input id={id(key)} type={type} value={panel[key] ?? ""} onChange={(e) => setPanel({ ...panel, [key]: e.target.value })}
                className="mt-1 block w-full rounded-lg border border-[#083D2D]/15 p-2 text-[13.5px] font-medium tabular-nums" />
            </label>
          ))}
          {NUTRIENT_FIELDS.map((f) => (
            <label key={f} className="text-[12px] font-bold text-[#101412]/60" htmlFor={id(f)}>{FIELD_LABEL[f]}
              <input id={id(f)} type="number" step="any" min="0" value={panel[f] ?? ""} onChange={(e) => setPanel({ ...panel, [f]: e.target.value })}
                placeholder="not read" className="mt-1 block w-full rounded-lg border border-[#083D2D]/15 p-2 text-[13.5px] font-medium tabular-nums" />
            </label>
          ))}
        </div>
      )}

      <Actions
        busy={busy}
        canCorrect={item.field_group !== "identity"}
        onAccept={() => onDecide(item, "accept")}
        onCorrect={() => onDecide(item, "correct", correction())}
        onReject={() => onDecide(item, "reject")}
      />
    </section>
  );
}

export default function ReviewConsole({ reviewerEmail }) {
  const [queue, setQueue] = useState({ toReview: [], toRead: [] });
  const [skuId, setSkuId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);

  // Bumping a version re-runs its effect; state is only ever set from the
  // request's callback, never synchronously inside an effect.
  const [queueVersion, setQueueVersion] = useState(0);
  const [detailVersion, setDetailVersion] = useState(0);
  const refresh = useCallback(() => { setQueueVersion((v) => v + 1); setDetailVersion((v) => v + 1); }, []);

  useEffect(() => {
    let live = true;
    api("GET")
      .then((q) => live && setQueue(q))
      .catch((e) => live && setNotice({ tone: "error", text: e.message }));
    return () => { live = false; };
  }, [queueVersion]);

  useEffect(() => {
    if (!skuId) return undefined;
    let live = true;
    api("GET", null, `?sku=${skuId}`)
      .then((d) => live && setDetail(d))
      .catch((e) => live && setNotice({ tone: "error", text: e.message }));
    return () => { live = false; };
  }, [skuId, detailVersion]);

  const run = async (fn, done) => {
    setBusy(true); setNotice(null);
    try { const r = await fn(); if (done) setNotice({ tone: "ok", text: done(r) }); }
    catch (e) { setNotice({ tone: "error", text: e.message }); }
    finally { setBusy(false); }
  };

  const read = (upload) => run(async () => {
    const r = await api("POST", { op: "read", uploadId: upload.uploadId });
    setSkuId(upload.skuId);
    refresh();
    return r;
  }, (r) => `Read. Published: ${r.published?.join(", ") || "nothing"}.${r.blocked?.length ? ` Couldn't publish: ${r.blocked.map((b) => b.group).join(", ")}.` : ""}`);

  const decideItem = (item, action, value) => run(async () => {
    await api("POST", { op: "decide", itemId: item.id, action, value });
    refresh();
  });

  const publishOutput = () => run(async () => {
    const r = await api("POST", { op: "publish", outputId: detail.output.id });
    refresh();
    return r;
  },(r) => `Published${r.published?.ingredients ? " the ingredient list and allergens" : ""}${r.published?.nutrition ? `${r.published?.ingredients ? " and" : ""} the nutrition table` : ""}.${r.stillOpen?.length ? ` Still open: ${r.stillOpen.join(" ")}` : ""}`);

  const checks = detail?.output?.checks || [];
  const itemsInOrder = useMemo(
    () => ["identity", "ingredients", "allergens", "nutrition"].map((g) => detail?.items?.find((i) => i.field_group === g)).filter(Boolean),
    [detail],
  );

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#16A06E]">KOI staff</p>
          <h1 className="text-[28px] font-extrabold text-[#083D2D]" style={HEADING}>Label engine</h1>
          <p className="mt-1 max-w-[62ch] text-[13px] text-[#101412]/60">
            Labels publish on their own when two readings agree and the checks pass. Nothing here is required —
            it lists what couldn&apos;t publish, and why, for anyone who wants to fix it.
          </p>
        </div>
        <div className="flex items-center gap-3 text-[12.5px] text-[#101412]/60">
          <span>Signed in as {reviewerEmail}</span>
          <button type="button" onClick={refresh} className="inline-flex items-center gap-1.5 rounded-full border border-[#083D2D]/20 bg-white px-3 py-1.5 font-bold text-[#083D2D]">
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Refresh
          </button>
        </div>
      </header>

      {notice && (
        <p role="status" className={`mt-4 rounded-xl px-4 py-2.5 text-[13.5px] font-semibold ${notice.tone === "error" ? "bg-rose-50 text-rose-800" : "bg-emerald-50 text-emerald-800"}`}>{notice.text}</p>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
        <aside className="space-y-6">
          <div>
            <h2 className="text-[12px] font-bold uppercase tracking-[0.12em] text-[#101412]/55">Couldn&apos;t publish automatically ({queue.toReview.length})</h2>
            <ul className="mt-2 space-y-2">
              {queue.toReview.map((e) => (
                <li key={e.skuId}>
                  <button type="button" onClick={() => setSkuId(e.skuId)}
                    className={`w-full rounded-xl border p-3 text-left ${skuId === e.skuId ? "border-[#083D2D] bg-white" : "border-transparent bg-white/70 hover:bg-white"}`}>
                    <span className="block text-[14px] font-bold text-[#083D2D]">{e.product}</span>
                    <span className="block text-[12px] text-[#101412]/55">{e.brand} · {e.groups.join(", ")}</span>
                  </button>
                </li>
              ))}
              {!queue.toReview.length && <li className="text-[13px] text-[#101412]/55">Everything read so far published.</li>}
            </ul>
          </div>
          <div>
            <h2 className="text-[12px] font-bold uppercase tracking-[0.12em] text-[#101412]/55">Photos not read yet ({queue.toRead.length})</h2>
            <ul className="mt-2 space-y-2">
              {queue.toRead.map((u) => (
                <li key={u.uploadId} className="flex items-center justify-between gap-2 rounded-xl bg-white/70 p-3">
                  <span className="min-w-0">
                    <span className="block truncate text-[13.5px] font-bold text-[#083D2D]">{u.product}</span>
                    <span className="block text-[11.5px] text-[#101412]/55">{u.fileType.replace("_", " ")}</span>
                  </span>
                  <button type="button" disabled={busy} onClick={() => read(u)}
                    className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#083D2D] px-3 py-1.5 text-[12px] font-bold text-white disabled:opacity-40">
                    <ScanText className="h-3.5 w-3.5" aria-hidden="true" /> Read
                  </button>
                </li>
              ))}
              {!queue.toRead.length && <li className="text-[13px] text-[#101412]/55">Every uploaded label has been read.</li>}
            </ul>
          </div>
        </aside>

        <main>
          {!detail ? (
            <div className="grid min-h-[320px] place-items-center rounded-2xl border border-dashed border-[#083D2D]/20 p-8 text-center text-[14px] text-[#101412]/55">
              <span><Upload className="mx-auto mb-2 h-6 w-6" aria-hidden="true" />Pick a reading on the left, or read a photo.</span>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-[22px] font-extrabold text-[#083D2D]" style={HEADING}>{detail.product} <span className="text-[14px] font-semibold text-[#101412]/50">{detail.brand}</span></h2>
                <span className="text-[12.5px] text-[#101412]/55 tabular-nums">
                  Checks passed {Math.round(detail.output.confidence * 100)}% · {detail.output.model} · {detail.output.prompt_version}
                </span>
              </div>

              <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,420px)_1fr]">
                <div className="space-y-4">
                  {detail.imageUrl && (
                    <a href={detail.imageUrl} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-2xl border border-[#083D2D]/10 bg-white">
                      {/* eslint-disable-next-line @next/next/no-img-element -- signed Storage URL, expires hourly */}
                      <img src={detail.imageUrl} alt={`Label photo for ${detail.product}`} className="w-full" />
                    </a>
                  )}
                  <ul className="space-y-1.5 rounded-2xl border border-[#083D2D]/10 bg-white p-4 text-[12.5px]">
                    {checks.map((c) => (
                      <li key={c.id} className="flex items-start gap-2">
                        {c.ok === true ? <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-700" aria-label="passed" />
                          : c.ok === false ? <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-700" aria-label="failed" />
                          : <Minus className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#101412]/40" aria-label="could not run" />}
                        <span>{c.detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="space-y-4">
                  <div className="rounded-2xl border border-[#083D2D]/10 bg-white p-4 text-[13px]">
                    <p><span className="font-bold text-[#083D2D]">Published automatically: </span>{detail.output.published?.join(", ") || "nothing"}</p>
                    {(detail.output.blocked || []).map((b) => (
                      <p key={b.group} className="mt-1 text-rose-800"><span className="font-bold">{b.group}: </span>{b.reason}</p>
                    ))}
                    {detail.output.second_model && <p className="mt-1 text-[12px] text-[#101412]/50">Second reading by {detail.output.second_model}.</p>}
                  </div>
                  {itemsInOrder.map((item) => (
                    <GroupCard key={`${item.id}-${item.status}`} item={item} busy={busy} onDecide={decideItem} />
                  ))}

                  <div className="rounded-2xl bg-[#083D2D] p-5 text-white">
                    <h3 className="text-[16px] font-extrabold" style={HEADING}>Publish to the storefront</h3>
                    {detail.blockers?.length ? (
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-[13px] text-white/80">{detail.blockers.map((b) => <li key={b}>{b}</li>)}</ul>
                    ) : (
                      <p className="mt-2 text-[13px] text-white/80">Every group is decided.</p>
                    )}
                    <button type="button" disabled={busy} onClick={publishOutput}
                      className="mt-4 rounded-full bg-[#DDF247] px-4 py-2 text-[13px] font-extrabold text-[#083D2D] disabled:opacity-40">
                      Publish what is decided
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
