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
import { useRouter } from "next/navigation";
import { useCartStore, hydrateCart } from "@/store/cartStore";
import { useLoginUi } from "@/store/loginUiStore";
import { useAuth } from "@/contexts/AuthContext";
import { getCatalogue } from "@/lib/cart/client";
import { lineKey } from "@/lib/cart/lines";
import { fulfilmentService, FULFILMENT } from "@/lib/supabase/fulfilmentService";
import OrdersBoard, { OrdersEmpty } from "@/components/store/orders/OrdersBoard";

export default function OrdersPage() {
  const router = useRouter();
  const { user } = useAuth();
  const openLogin = useLoginUi((s) => s.openLogin);

  const [intents, setIntents] = useState([]);
  const [loading, setLoading] = useState(true);
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
    // The board sends KOI's dot to the cart, then opens it (OrdersBoard).
  };

  const handleFinish = async (intent) => {
    setBusyId(intent.id);
    await putBack(intent, { exact: true });
    setBusyId(null);
    router.push("/store/checkout");
  };

  // ─── SIGNED OUT ───
  if (!loading && !user?.uid) {
    return <OrdersEmpty title="Sign in to see your baskets" body="Your fulfilment history is tied to your KOI account." cta="Sign in with phone" onCta={() => openLogin()} />;
  }

  if (loading) {
    return <main role="status" className="mx-auto w-full max-w-[1440px] px-[clamp(16px,4vw,52px)] pt-10 font-koi-sans text-sm font-medium text-koi-ink2">Loading your baskets…</main>;
  }

  if (intents.length === 0) {
    return <OrdersEmpty title="No baskets yet" body="Plan the week and KOI fills your cart, or pick things yourself — every basket you send shows up here." cta="Plan this week" href="/store/plan" />;
  }

  // The view (components/store/orders/OrdersBoard.jsx) leads with the latest
  // basket at Swiggy, then what is not sent yet, then the earlier ones.
  return (
    <OrdersBoard
      intents={intents}
      bySku={bySku}
      busyId={busyId}
      note={note}
      selected={selected}
      onSelect={setSelected}
      onReport={handleReport}
      onReorder={handleReorder}
      onFinish={handleFinish}
      onDiscard={handleDiscard}
    />
  );
}
