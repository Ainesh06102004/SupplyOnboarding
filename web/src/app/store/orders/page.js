"use client";

// ============================================================================
// KOI STORE — Fulfilment history
//
// What this page used to be: two hardcoded orders for brands KOI has never
// screened (The Whole Truth, Epigamia, Farmley, Borécha), each with an
// invented KOI score, a four-step delivery tracker reading "Out for Delivery",
// an ETA of "Delivered by 7:30 PM", a payment method, and a sidebar asserting
// "Avg KOI Score 89" and "Avg Protein/Order 74g".
//
// KOI can observe none of that. It is not merchant of record, gets no delivery
// webhook and holds no payment record. The tracker was the worst of it: four
// states, three of which KOI has no way to know.
//
// So this page shows fulfilment intents — the record of what KOI actually did
// — and its status vocabulary stops exactly where KOI's knowledge stops. The
// last step is "Handed off to Swiggy", and the only thing that can move an
// intent past it is the shopper telling us it arrived.
//
// Tied to the rest of the store now: a basket the week's plan filled links back
// to that plan (00085, "Week plan · Track →"); "Build this basket again" puts
// every product back at the quantity sent, by SKU, without emptying the cart
// first; "Finish this basket" restores the draft's own lines before checkout.
// ============================================================================

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCartStore, hydrateCart } from "@/store/cartStore";
import { useCartUi } from "@/store/cartUiStore";
import { useAuth } from "@/contexts/AuthContext";
import { getCatalogue } from "@/lib/cart/client";
import { lineKey } from "@/lib/cart/lines";
import { fulfilmentService, FULFILMENT, DELIVERY_REPORT, describeState } from "@/lib/supabase/fulfilmentService";
import Sheet from "@/components/store/system/Sheet";
import { Button, Money, MonoLabel, ProductThumb, ScoreBadge, Icon } from "@/components/store/system/primitives";

// Three steps, because KOI knows three things. There is deliberately no
// "Packed" and no "Out for delivery": those happen inside Swiggy, which does
// not tell KOI about them. Showing them would be a guess dressed as tracking.
const STEPS = ["Basket assembled", "Handed off to Swiggy", "You confirm arrival"];

function stepIndex(state) {
  if (state === FULFILMENT.REPORTED_DELIVERED) return 2;
  if (state === FULFILMENT.HANDED_OFF) return 1;
  return 0;
}

function Progress({ state }) {
  const current = stepIndex(state);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", gap: 6, flexWrap: "wrap" }}>
        {STEPS.map((label, i) => (
          <li key={label} style={{ display: "inline-flex", alignItems: "center", gap: 6, font: "600 12.5px var(--koi-sans-stack)", color: i <= current ? "var(--koi-primary)" : "var(--koi-muted)" }}>
            <span style={{ width: 20, height: 20, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", background: i <= current ? "var(--koi-primary)" : "var(--koi-track)", color: "#fff" }}>
              {i <= current ? <Icon.Check style={{ width: 11, height: 11 }} /> : null}
            </span>
            {label}
            {i < STEPS.length - 1 && <span aria-hidden="true" style={{ color: "#a7a89c", marginLeft: 2 }}>›</span>}
          </li>
        ))}
      </ol>
      <p style={{ margin: 0, font: "400 12px/1.5 var(--koi-sans-stack)", color: "var(--koi-ink2)" }}>
        KOI can see the first two. What happens inside Swiggy — packing, dispatch, delivery — is theirs to show you.
      </p>
    </div>
  );
}

const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" }) : "");

export default function OrdersPage() {
  const router = useRouter();
  const { user } = useAuth();
  const openSheet = useCartUi((s) => s.openSheet);

  const [intents, setIntents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("active");
  const [selected, setSelected] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [note, setNote] = useState(null);
  const [catalogue, setCatalogue] = useState([]);

  const load = useCallback(async () => {
    if (!user?.uid) { setIntents([]); setLoading(false); return; }
    setLoading(true);
    const rows = await fulfilmentService.listIntents(user.uid);
    setIntents(rows);
    setLoading(false);
  }, [user]);

  // Deferred by a tick, the same way AddressManager loads: `load` flips
  // `loading` synchronously, and React's set-state-in-effect rule (correctly)
  // rejects that as a render-phase update.
  useEffect(() => {
    const t = setTimeout(() => load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  // The live catalogue, for pack shots and for putting a basket back.
  useEffect(() => {
    let alive = true;
    getCatalogue().then((c) => { if (alive) setCatalogue(c ?? []); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  const bySku = useMemo(() => new Map(catalogue.map((p) => [String(p.skuId), p])), [catalogue]);

  // "Active" is anything KOI still considers open — a basket it holds, or one
  // handed off that the shopper has not yet confirmed arrived.
  const isActive = (i) => i.state === FULFILMENT.DRAFT || i.state === FULFILMENT.HANDED_OFF;
  const shown = intents.filter((i) => (activeTab === "active" ? isActive(i) : !isActive(i)));
  const fromPlan = intents.find((i) => i.nutrition_plan_id && i.state === FULFILMENT.HANDED_OFF);

  const handleReport = async (intent, report) => {
    setBusyId(intent.id);
    await fulfilmentService.reportDelivery(intent.id, report);
    await load();
    setSelected(null);
    setBusyId(null);
  };

  // Discarding a DRAFT is the only cancellation KOI can actually perform.
  // Nothing has been sent anywhere, so this is KOI's own record and KOI's to
  // close. A handed-off intent gets no such button: the cart is on Swiggy's
  // side and there is no cancellation tool, which is why that path is a phone
  // number rather than a control that would quietly do nothing.
  const handleDiscard = async (intent) => {
    setBusyId(intent.id);
    await fulfilmentService.abandon(intent.id);
    await load();
    setSelected(null);
    setBusyId(null);
  };

  /**
   * Put a past basket's products back in the cart at the quantities sent.
   * By SKU against the live catalogue: prices and scores are today's, never
   * the snapshot's. With `exact`, a line already in the cart is SET to the
   * basket's quantity (finishing a draft); otherwise the packs are added.
   */
  const putBack = async (intent, { exact = false } = {}) => {
    await hydrateCart();
    const all = catalogue.length ? catalogue : await getCatalogue().catch(() => []);
    const map = new Map(all.map((p) => [String(p.skuId), p]));
    const cart = useCartStore.getState();
    let gone = 0;
    for (const line of intent.items ?? []) {
      const product = line.koi_sku_id ? map.get(String(line.koi_sku_id)) : null;
      if (!product) { gone += 1; continue; }
      const key = lineKey({ skuId: product.skuId, productId: product.id });
      const inCart = useCartStore.getState().items.some((i) => lineKey(i) === key);
      if (exact && inCart) cart.setQty(key, line.quantity);
      else cart.add(product, line.quantity);
    }
    return gone;
  };

  const handleReorder = async (intent) => {
    setBusyId(intent.id);
    const gone = await putBack(intent);
    setBusyId(null);
    setNote(gone ? `${gone} ${gone === 1 ? "product isn't" : "products aren't"} in the shop any more, so ${gone === 1 ? "it was" : "they were"} left out.` : null);
    openSheet();
  };

  const handleFinish = async (intent) => {
    setBusyId(intent.id);
    await putBack(intent, { exact: true });
    setBusyId(null);
    router.push("/store/checkout");
  };

  // ─── SIGNED OUT ───
  if (!loading && !user?.uid) {
    return <EmptyShell title="Sign in to see your baskets" body="Your fulfilment history is tied to your KOI account." cta="Go to the shop" href="/store/shop" />;
  }

  if (loading) {
    return (
      <main className="ks-page" role="status" style={{ font: "500 14px var(--koi-sans-stack)", color: "var(--koi-ink2)" }}>
        Loading your baskets…
      </main>
    );
  }

  if (intents.length === 0) {
    return <EmptyShell title="No baskets yet" body="Plan the week and KOI fills your cart, or pick things yourself — every basket you send shows up here." cta="Plan this week" href="/store/plan" />;
  }

  return (
    <main className="ks-page" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
        <h1 className="ks-h1">Orders</h1>
        <div role="tablist" aria-label="Orders" style={{ display: "inline-flex", background: "#fff", border: "1px solid var(--koi-line2)", borderRadius: 999, padding: 4 }}>
          {[["active", "Active"], ["past", "Past"]].map(([key, label]) => (
            <button key={key} type="button" role="tab" aria-selected={activeTab === key} onClick={() => setActiveTab(key)}
              style={{ border: 0, cursor: "pointer", borderRadius: 999, padding: "8px 16px", font: `${activeTab === key ? 700 : 600} 13.5px var(--koi-sans-stack)`, background: activeTab === key ? "var(--koi-primary)" : "transparent", color: activeTab === key ? "#fff" : "var(--koi-ink2)" }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {note && (
        <p role="status" style={{ margin: 0, background: "var(--koi-warm-bg)", borderRadius: 14, padding: "10px 14px", font: "500 13.5px var(--koi-sans-stack)", color: "var(--koi-warm-ink)" }}>{note}</p>
      )}

      <div className="ks-split">
        <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
          {shown.length === 0 ? (
            <section className="ks-card" style={{ padding: 32, textAlign: "center", font: "600 14px var(--koi-sans-stack)", color: "var(--koi-ink2)" }}>No {activeTab} baskets.</section>
          ) : shown.map((intent) => {
            const desc = describeState(intent.state);
            const lines = intent.items || [];
            const draft = intent.state === FULFILMENT.DRAFT;
            const handedOff = intent.state === FULFILMENT.HANDED_OFF;
            return (
              <section key={intent.id} className={draft ? "ks-card" : "ks-card"} data-tone={draft ? "dashed" : undefined} style={{ padding: 22, display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <span style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 6, font: "700 12.5px var(--koi-sans-stack)", borderRadius: 999, padding: "4px 11px", background: draft ? "#fff" : "var(--koi-tint)", color: draft ? "var(--koi-ink2)" : "var(--koi-primary)", border: `1px solid ${draft ? "var(--koi-line2)" : "var(--koi-tint-border)"}` }}>
                      {!draft && <Icon.Check style={{ width: 12, height: 12 }} />}{draft ? "Unfinished basket" : desc.label}
                    </span>
                    <span style={{ font: "700 18px var(--koi-sans-stack)", letterSpacing: "-.01em" }}>{fmtDate(intent.handed_off_at ?? intent.created_at)}</span>
                    {intent.external_order_ref && <MonoLabel style={{ letterSpacing: ".06em" }}>Swiggy ref {intent.external_order_ref}</MonoLabel>}
                  </div>
                  {intent.nutrition_plan_id && (
                    <Link href="/store/plan?step=track" style={{ display: "inline-flex", alignItems: "center", gap: 10, textDecoration: "none", background: "var(--koi-deep)", color: "#fff", borderRadius: 14, padding: "10px 14px" }}>
                      <Icon.Calendar style={{ color: "var(--koi-mint)" }} />
                      <span style={{ display: "flex", flexDirection: "column" }}>
                        <MonoLabel tone="mint">Week plan</MonoLabel>
                        <span style={{ font: "700 13.5px var(--koi-sans-stack)" }}>Track this week →</span>
                      </span>
                    </Link>
                  )}
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                  <div style={{ display: "flex", paddingLeft: 8 }}>
                    {lines.slice(0, 4).map((l) => (
                      <span key={l.id} style={{ marginLeft: -8, borderRadius: 12, border: "2px solid #fff", display: "inline-flex" }}>
                        <ProductThumb src={bySku.get(String(l.koi_sku_id))?.image?.hero || null} size={42} radius={10} />
                      </span>
                    ))}
                    {lines.length > 4 && <span className="ks-num" style={{ marginLeft: -8, width: 46, height: 46, borderRadius: 12, border: "2px solid #fff", background: "var(--koi-quiet)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 12.5, color: "var(--koi-ink2)" }}>+{lines.length - 4}</span>}
                  </div>
                  <span style={{ font: "400 14px var(--koi-sans-stack)", color: "var(--koi-ink2)" }}>
                    <span className="ks-num" style={{ color: "var(--koi-ink)" }}>{lines.length}</span> {lines.length === 1 ? "product" : "products"} · <span className="ks-num" style={{ color: "var(--koi-ink)" }}>{intent.item_count}</span> packs
                  </span>
                  <span style={{ flex: 1 }} />
                  {intent.provider_subtotal_at_handoff !== null && intent.provider_subtotal_at_handoff !== undefined ? (
                    <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                      <Money value={intent.provider_subtotal_at_handoff} size={20} />
                      <MonoLabel style={{ letterSpacing: ".06em" }}>Swiggy&apos;s price at hand-off</MonoLabel>
                    </span>
                  ) : intent.subtotal_at_handoff !== null ? (
                    <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                      <Money value={intent.subtotal_at_handoff} size={20} />
                      <MonoLabel style={{ letterSpacing: ".06em" }}>MRP total</MonoLabel>
                    </span>
                  ) : null}
                </div>

                {isActive(intent) && !draft && <Progress state={intent.state} />}

                <div style={{ display: "flex", gap: 10, borderTop: "1px solid var(--koi-divider)", paddingTop: 14, flexWrap: "wrap" }}>
                  {handedOff && (
                    <Button variant="secondary" size="sm" onClick={() => handleReport(intent, DELIVERY_REPORT.ARRIVED)} busy={busyId === intent.id}>It arrived</Button>
                  )}
                  {draft ? (
                    <>
                      <Button variant="ghost" size="sm" onClick={() => handleDiscard(intent)} disabled={busyId === intent.id}>Discard</Button>
                      <span style={{ flex: 1 }} />
                      <Button size="sm" onClick={() => handleFinish(intent)} busy={busyId === intent.id}>Finish this basket →</Button>
                    </>
                  ) : (
                    <>
                      <Button variant="secondary" size="sm" onClick={() => handleReorder(intent)} busy={busyId === intent.id}>Build this basket again</Button>
                      <span style={{ flex: 1 }} />
                      <Button variant="ghost" size="sm" onClick={() => setSelected(intent)}>Details</Button>
                    </>
                  )}
                </div>
              </section>
            );
          })}
          <p style={{ margin: 0, font: "400 13px/1.5 var(--koi-sans-stack)", color: "var(--koi-ink2)" }}>
            &ldquo;Finish this basket&rdquo; puts the draft&apos;s own products back in your cart before checkout. &ldquo;Build this basket again&rdquo; adds every product back at the quantity you sent.
          </p>
        </div>

        {/* What KOI can and cannot tell you. Replaces the old "Your KOI
            Insights" panel, which asserted an average score and an average
            protein per order that were both literals unconnected to any basket. */}
        <aside className="ks-rail">
          {fromPlan && (
            <section className="ks-card" data-tone="deep" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 10 }}>
              <MonoLabel tone="mint">This week</MonoLabel>
              <span style={{ font: "700 17px var(--koi-sans-stack)" }}>Your week is ordered.</span>
              <span style={{ font: "400 13.5px/1.5 var(--koi-sans-stack)", color: "rgba(255,255,255,.75)" }}>Log a weigh-in on Track whenever you like — KOI compares it with the plan&apos;s arithmetic.</span>
              <Button href="/store/plan?step=track" variant="mint" size="sm">Open Track</Button>
            </section>
          )}
          <section className="ks-card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 8 }}>
            <MonoLabel>Where your order lives</MonoLabel>
            <p style={{ margin: 0, font: "400 13.5px/1.55 var(--koi-sans-stack)", color: "var(--koi-ink2)" }}>
              KOI curates and hands off. Once a basket reaches Swiggy, they own the delivery — and they hold the live tracking, the payment record and support.
            </p>
            <a href="https://www.swiggy.com/instamart" target="_blank" rel="noopener noreferrer" className="ks-btn" data-variant="secondary" data-size="sm" style={{ alignSelf: "flex-start" }}>Track on Swiggy ↗</a>
            <p style={{ margin: 0, font: "400 12px/1.5 var(--koi-sans-stack)", color: "var(--koi-ink2)" }}>Need to cancel? Swiggy has no cancellation API — call their support on 080-67466729.</p>
          </section>
        </aside>
      </div>

      <Sheet open={Boolean(selected)} onClose={() => setSelected(null)} label="Basket details">
        {selected && (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 22px 14px", borderBottom: "1px solid var(--koi-line)" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <MonoLabel>Basket</MonoLabel>
                <span style={{ font: "800 20px var(--koi-sans-stack)", letterSpacing: "-.02em" }}>{describeState(selected.state).label}</span>
              </div>
              <button type="button" onClick={() => setSelected(null)} aria-label="Close" style={{ width: 38, height: 38, borderRadius: "50%", background: "#fff", border: "1px solid var(--koi-line2)", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Icon.Close /></button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "16px 18px", display: "flex", flexDirection: "column", gap: 14 }}>
              {selected.address_snapshot && (
                <section className="ks-card" style={{ padding: 14 }}>
                  <MonoLabel>Delivering to</MonoLabel>
                  <p style={{ margin: "4px 0 0", font: "500 13.5px/1.5 var(--koi-sans-stack)" }}>
                    {[selected.address_snapshot.street, selected.address_snapshot.city, selected.address_snapshot.state, selected.address_snapshot.pincode].filter(Boolean).join(", ")}
                  </p>
                </section>
              )}
              <section className="ks-card" style={{ overflow: "hidden" }}>
                <div style={{ padding: "12px 16px 8px" }}><MonoLabel>Products · <span className="ks-num">{(selected.items || []).length}</span></MonoLabel></div>
                {(selected.items || []).map((line) => (
                  <div key={line.id} className="ks-line" style={{ padding: "10px 16px" }}>
                    <ProductThumb src={bySku.get(String(line.koi_sku_id))?.image?.hero || null} size={44} radius={11} />
                    <div className="ks-line-main">
                      {line.brand_name && <MonoLabel style={{ letterSpacing: ".08em" }}>{line.brand_name}</MonoLabel>}
                      <span className="ks-line-name" style={{ fontSize: 14 }}>{line.product_name}</span>
                      <MonoLabel style={{ letterSpacing: ".06em" }}>× <span className="ks-num">{line.quantity}</span></MonoLabel>
                    </div>
                    <ScoreBadge score={line.koi_score_at_handoff} size={32} />
                    {line.unit_mrp_at_handoff !== null && <Money value={Number(line.unit_mrp_at_handoff) * line.quantity} size={14} />}
                  </div>
                ))}
                <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 16px", borderTop: "1px solid var(--koi-divider)" }}>
                  <span style={{ font: "700 14px var(--koi-sans-stack)" }}>MRP total</span>
                  {selected.subtotal_at_handoff !== null ? <Money value={selected.subtotal_at_handoff} size={16} /> : <span>—</span>}
                </div>
              </section>
              <p style={{ margin: 0, font: "400 12px/1.5 var(--koi-sans-stack)", color: "var(--koi-ink2)" }}>KOI&apos;s listed prices at hand-off. What you paid is on your Swiggy receipt.</p>
              {selected.state === FULFILMENT.HANDED_OFF && (
                <section className="ks-card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
                  <span style={{ font: "700 14px var(--koi-sans-stack)" }}>Did this arrive?</span>
                  <span style={{ font: "400 12.5px/1.5 var(--koi-sans-stack)", color: "var(--koi-ink2)" }}>KOI doesn&apos;t get delivery updates from Swiggy, so this is the only way we know.</span>
                  <div style={{ display: "flex", gap: 8 }}>
                    <Button size="sm" onClick={() => handleReport(selected, DELIVERY_REPORT.ARRIVED)} disabled={busyId === selected.id} style={{ flex: 1 }}>Yes, it arrived</Button>
                    <Button size="sm" variant="secondary" onClick={() => handleReport(selected, DELIVERY_REPORT.PARTIAL)} disabled={busyId === selected.id} style={{ flex: 1 }}>Partly</Button>
                  </div>
                </section>
              )}
            </div>
          </>
        )}
      </Sheet>
    </main>
  );
}

function EmptyShell({ title, body, cta, href }) {
  return (
    <main className="ks-page" style={{ maxWidth: 640 }}>
      <section className="ks-card" style={{ padding: 32, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 12 }}>
        <span style={{ width: 64, height: 64, borderRadius: "50%", background: "var(--koi-quiet)", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#8fae98" }}><Icon.Bag style={{ width: 26, height: 26 }} /></span>
        <h1 style={{ margin: 0, font: "800 22px var(--koi-sans-stack)", letterSpacing: "-.02em" }}>{title}</h1>
        <p style={{ margin: 0, font: "400 14.5px/1.55 var(--koi-sans-stack)", color: "var(--koi-ink2)", maxWidth: 420 }}>{body}</p>
        <Button href={href}>{cta} →</Button>
      </section>
    </main>
  );
}
