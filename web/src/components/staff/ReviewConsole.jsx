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
//
// Shot as the StaffReview board (Oct 2026): KOI night, the queue on the left,
// the photo and its checks beside the field groups, a forest publish card.
// ============================================================================

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, X, Minus, ScanText, RefreshCw } from "lucide-react";
import { ALLERGEN_FLAGS } from "@/lib/engine/checks";
import { NUTRIENT_FIELDS } from "@/lib/engine/labelSchema";
import { FOODS_AVOID } from "@/lib/recommendation/config";
import { StaffHeader, StaffStage, StaffTitle } from "@/components/staff/StaffChrome";
import { setupMotion, prefersReducedMotion, useGSAP, E } from "@/lib/motion/koiMotion";

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
  pending: { card: "border-koi-amber/40 bg-koi-amber/10", badge: "bg-koi-amber/25 text-koi-amber-bg" },
  accepted: { card: "border-koi-bg/10 bg-white/5", badge: "bg-koi-lime/15 text-koi-lime" },
  corrected: { card: "border-koi-bg/10 bg-white/5", badge: "bg-koi-mint/15 text-koi-mint" },
  rejected: { card: "border-koi-red/40 bg-koi-red/10", badge: "bg-koi-red/25 text-koi-red-bg" },
  superseded: { card: "border-koi-bg/10 bg-white/[0.03]", badge: "bg-koi-bg/10 text-koi-bg/60" },
};

const FIELD = "rounded-xl border border-koi-bg/20 bg-white/5 text-koi-bg outline-none placeholder:text-koi-bg/40 focus:border-koi-lime";
const LABEL = "font-koi-mono text-[10.5px] font-semibold uppercase tracking-[0.12em] text-koi-bg/55";

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
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      <button type="button" disabled={busy} onClick={onAccept} className="h-10 rounded-full bg-koi-lime px-4 text-[13px] font-bold text-koi-forest disabled:opacity-50">Accept as read</button>
      {canCorrect && <button type="button" disabled={busy} onClick={onCorrect} className="h-10 rounded-full border border-koi-bg/20 px-4 text-[13px] font-semibold hover:bg-white/5 disabled:opacity-50">Save correction</button>}
      <button type="button" disabled={busy} onClick={onReject} className="h-10 rounded-full px-4 text-[13px] font-semibold text-koi-red hover:bg-koi-red/20 disabled:opacity-50">Reject</button>
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
  const tone = STATUS_STYLE[item.status] ?? STATUS_STYLE.pending;

  return (
    <article data-group className={`flex flex-col rounded-[20px] border p-4 md:p-5 ${tone.card}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="m-0 text-[15px] font-bold">{GROUP_TITLE[item.field_group]}</h3>
        <span className={`rounded-full px-2.5 py-0.5 font-koi-mono text-[10px] font-semibold uppercase tracking-[0.12em] ${tone.badge}`}>{item.status}</span>
      </div>
      <p className="m-0 mt-1 text-[12.5px] text-koi-bg/60">{item.route_reason}</p>

      {item.field_group === "identity" && (
        <dl className="m-0 mt-3 grid grid-cols-[130px_minmax(0,1fr)] gap-x-3 gap-y-1 text-[13px]">
          {[["Name on pack", initial.product_name], ["Brand", initial.brand], ["Net quantity", initial.net_quantity], ["Veg mark", initial.veg_mark], ["FSSAI licence", initial.fssai_licence]].map(([k, v]) => (
            <React.Fragment key={k}><dt className="text-koi-bg/60">{k}</dt><dd className="m-0 font-semibold">{v ?? "—"}</dd></React.Fragment>
          ))}
        </dl>
      )}

      {item.field_group === "ingredients" && (
        <div className="mt-3">
          <label htmlFor={id("text")} className={LABEL}>As printed</label>
          <textarea id={id("text")} value={text} onChange={(e) => setText(e.target.value)} rows={5}
            className={`mt-1 w-full p-3 text-[13.5px] leading-relaxed ${FIELD}`} />
          <p className="m-0 mt-1 text-[12px] text-koi-bg/55">{splitIngredients(text).length} ingredients, split at top-level commas.</p>
        </div>
      )}

      {item.field_group === "allergens" && (
        <div className="mt-3 flex flex-col gap-3 text-[13.5px]">
          <p className="m-0"><span className="text-koi-bg/60">Statement: </span>{item.proposed.statement || <em className="text-koi-ember">none read</em>}</p>
          {item.proposed.may_contain_statement && <p className="m-0"><span className="text-koi-bg/60">May contain: </span>{item.proposed.may_contain_statement}</p>}
          {[["Contains", contains, setContains], ["May contain", mayContain, setMayContain]].map(([title, list, setList]) => (
            <fieldset key={title} className="m-0 border-0 p-0">
              <legend className={LABEL}>{title}</legend>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {ALLERGEN_FLAGS.map((flag) => (
                  <label key={flag} className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-[12.5px] font-semibold transition-colors ${list.includes(flag) ? "border-koi-lime bg-koi-lime text-koi-forest" : "border-koi-bg/20 text-koi-bg/80 hover:border-koi-bg/40"}`}>
                    <input type="checkbox" className="sr-only" checked={list.includes(flag)} onChange={() => toggle(list, setList, flag)} />
                    {FLAG_LABEL[flag]}
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
          <p className="m-0 text-[12px] text-koi-bg/55">Proposed from the ingredient list: {item.proposed.from_text?.map((f) => FLAG_LABEL[f]).join(", ") || "none"}; from the statement: {item.proposed.from_statement?.map((f) => FLAG_LABEL[f]).join(", ") || "none"}.</p>
        </div>
      )}

      {item.field_group === "nutrition" && (
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className={LABEL} htmlFor={id("basis")}>Basis
            <select id={id("basis")} value={panel.measurement_basis} onChange={(e) => setPanel({ ...panel, measurement_basis: e.target.value })}
              className={`mt-1 block h-10 w-full px-2 font-koi-sans text-[13.5px] font-medium normal-case tracking-normal ${FIELD}`}>
              <option value="per_100g" className="text-koi-ink">per 100 g</option><option value="per_100ml" className="text-koi-ink">per 100 ml</option><option value="per_serving" className="text-koi-ink">per serving</option>
            </select>
          </label>
          {[["serving_size", "Serving size", "text"], ["servings_per_pack", "Servings per pack", "number"]].map(([key, label, type]) => (
            <label key={key} className={LABEL} htmlFor={id(key)}>{label}
              <input id={id(key)} type={type} value={panel[key] ?? ""} onChange={(e) => setPanel({ ...panel, [key]: e.target.value })}
                className={`mt-1 block h-10 w-full px-2 font-koi-num text-[13.5px] font-medium normal-case tracking-normal ${FIELD}`} />
            </label>
          ))}
          {NUTRIENT_FIELDS.map((f) => (
            <label key={f} className={LABEL} htmlFor={id(f)}>{FIELD_LABEL[f]}
              <input id={id(f)} type="number" step="any" min="0" value={panel[f] ?? ""} onChange={(e) => setPanel({ ...panel, [f]: e.target.value })}
                placeholder="not read" className={`mt-1 block h-10 w-full px-2 font-koi-num text-[13.5px] font-medium normal-case tracking-normal ${FIELD}`} />
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
    </article>
  );
}

export default function ReviewConsole({ reviewerEmail }) {
  const [queue, setQueue] = useState({ toReview: [], toRead: [] });
  const [skuId, setSkuId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const detailRef = useRef(null);

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

  // A newly picked reading slides in; a refresh of the same one does not.
  const shownSku = detail?.output?.id ?? null;
  useGSAP(() => {
    if (!shownSku || !detailRef.current || prefersReducedMotion()) return;
    const gsap = setupMotion();
    gsap.from(detailRef.current.querySelectorAll("[data-photo], [data-group], [data-publish]"), { autoAlpha: 0, y: 18, duration: 0.5, stagger: 0.06, ease: E.reveal, clearProps: "opacity,visibility,transform" });
  }, { scope: detailRef, dependencies: [shownSku] });

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
    <StaffStage className="pb-10">
      <StaffHeader who={reviewerEmail} />
      <StaffTitle
        title="Label engine"
        aside={
          <button type="button" onClick={refresh} className="flex h-10 items-center gap-2 rounded-full border border-koi-bg/20 px-4 text-[13px] font-semibold hover:bg-white/5">
            <RefreshCw className="size-3.5" aria-hidden="true" /> Refresh
          </button>
        }
      >
        Labels publish on their own when two readings agree and the checks pass. Nothing here is required —
        it lists what couldn&apos;t publish, and why, for anyone who wants to fix it.
      </StaffTitle>

      {notice && (
        <p role="status" className={`m-0 mx-5 mt-4 rounded-2xl px-4 py-3 text-sm font-semibold md:mx-8 ${notice.tone === "error" ? "bg-koi-red/20 text-koi-red-bg" : "bg-koi-lime text-koi-forest"}`}>{notice.text}</p>
      )}

      <div className="relative z-10 grid grid-cols-1 gap-5 px-5 py-6 md:px-8 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="flex flex-col gap-5">
          <section data-section className="flex flex-col gap-2 rounded-[22px] bg-white/5 p-4">
            <h2 className="m-0 text-[14px] font-bold">Couldn&apos;t publish automatically ({queue.toReview.length})</h2>
            {queue.toReview.map((e) => {
              const on = skuId === e.skuId;
              return (
                <button key={e.skuId} type="button" aria-pressed={on} onClick={() => setSkuId(e.skuId)}
                  className={`flex flex-col gap-0.5 rounded-xl border px-3 py-2.5 text-left transition-colors ${on ? "border-koi-lime bg-koi-lime/10" : "border-transparent bg-white/5 hover:bg-white/10"}`}>
                  <span className="flex items-center gap-2 text-[14px] font-semibold">{on && <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-koi-ember" />}{e.product}</span>
                  <span className="text-[12px] text-koi-bg/60">{e.brand} · {e.groups.join(", ")}</span>
                </button>
              );
            })}
            {!queue.toReview.length && <p className="m-0 text-[13px] text-koi-bg/60">Everything read so far published.</p>}
          </section>
          <section data-section className="flex flex-col gap-2 rounded-[22px] bg-white/5 p-4">
            <h2 className="m-0 text-[14px] font-bold">Photos not read yet ({queue.toRead.length})</h2>
            {queue.toRead.map((u) => (
              <div key={u.uploadId} className="flex items-center justify-between gap-3 rounded-xl bg-white/5 px-3 py-2.5">
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-[14px] font-semibold">{u.product}</span>
                  <span className="text-[12px] text-koi-bg/60">{u.fileType.replace("_", " ")}</span>
                </span>
                {/* Reading calls a paid model (see lib/engine). */}
                <button type="button" disabled={busy} onClick={() => read(u)}
                  className="flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-koi-lime px-3 text-[12.5px] font-bold text-koi-forest disabled:opacity-50">
                  <ScanText className="size-3.5" aria-hidden="true" /> Read
                </button>
              </div>
            ))}
            {!queue.toRead.length && <p className="m-0 text-[13px] text-koi-bg/60">Every uploaded label has been read.</p>}
          </section>
        </aside>

        <section ref={detailRef} aria-label="Reading" className="flex min-w-0 flex-col gap-4">
          {!detail ? (
            <div data-section className="grid min-h-[420px] place-items-center rounded-[26px] border border-dashed border-koi-bg/15 p-8 text-center text-[15px] text-koi-bg/60">
              Pick a reading on the left, or read a photo.
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h2 className="m-0 font-koi-display text-[30px] font-extrabold tracking-[-0.01em]">{detail.product} <span className="text-[18px] font-semibold text-koi-bg/60">{detail.brand}</span></h2>
                <span className="font-koi-mono text-[11px] uppercase tracking-[0.12em] text-koi-bg/60">
                  Checks passed {Math.round(detail.output.confidence * 100)}% · {detail.output.model} · {detail.output.prompt_version}
                </span>
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
                <div className="flex flex-col gap-4">
                  {detail.imageUrl && (
                    <a data-photo href={detail.imageUrl} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-[20px] bg-koi-bg p-2">
                      {/* eslint-disable-next-line @next/next/no-img-element -- signed Storage URL, expires hourly */}
                      <img src={detail.imageUrl} alt={`Label photo for ${detail.product}`} className="w-full rounded-[14px]" />
                    </a>
                  )}
                  <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                    {checks.map((c) => (
                      <li key={c.id} className="flex items-start gap-2.5 text-[12.5px] leading-snug">
                        {c.ok === true ? <span aria-label="passed" className="mt-px grid size-5 shrink-0 place-items-center rounded-full bg-koi-lime/20 text-koi-lime"><Check className="size-3" strokeWidth={3} /></span>
                          : c.ok === false ? <span aria-label="failed" className="mt-px grid size-5 shrink-0 place-items-center rounded-full bg-koi-red/25 text-koi-red-bg"><X className="size-3" strokeWidth={3} /></span>
                          : <span aria-label="could not run" className="mt-px grid size-5 shrink-0 place-items-center rounded-full bg-koi-bg/10 text-koi-bg/50"><Minus className="size-3" strokeWidth={3} /></span>}
                        <span className="text-koi-bg/85">{c.detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="flex min-w-0 flex-col gap-3">
                  <div className="flex flex-col gap-1 rounded-[18px] bg-white/5 p-4 text-[13px]">
                    <p className="m-0"><span className="text-koi-bg/60">Published automatically: </span>{detail.output.published?.join(", ") || "nothing"}</p>
                    {(detail.output.blocked || []).map((b) => (
                      <p key={b.group} className="m-0 text-koi-ember"><span className="font-semibold">{b.group}: </span>{b.reason}</p>
                    ))}
                    {detail.output.second_model && <p className="m-0 text-koi-bg/60">Second reading by {detail.output.second_model}.</p>}
                  </div>
                  {itemsInOrder.map((item) => (
                    <GroupCard key={`${item.id}-${item.status}`} item={item} busy={busy} onDecide={decideItem} />
                  ))}

                  <div data-publish className="flex flex-col gap-3 rounded-[20px] bg-koi-forest p-5">
                    <h3 className="m-0 font-koi-display text-[20px] font-extrabold">Publish to the storefront</h3>
                    {detail.blockers?.length ? (
                      <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[13px] text-koi-bg/80">{detail.blockers.map((b) => <li key={b}>{b}</li>)}</ul>
                    ) : (
                      <p className="m-0 text-[13px] text-koi-mint">Every group is decided.</p>
                    )}
                    <button type="button" disabled={busy} onClick={publishOutput}
                      className="h-12 self-start rounded-full bg-koi-lime px-6 text-sm font-bold text-koi-forest disabled:opacity-40">
                      Publish what is decided
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </StaffStage>
  );
}
