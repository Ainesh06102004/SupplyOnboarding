// ============================================================================
// GET /api/products/relative?skuId= — a product in context (plan §11.2)
//
// Off unless KOI_RELATIVE_SCORES=on, which is set per environment (plan §11.2).
// The founder has decided what it shows: one line, the product's most
// favourable comparison, or nothing.
//
// The reference is internal (engine, service role); only the sentence leaves,
// with its attribution, version and date. Nothing here changes a score, an
// eligibility decision, an allergen or a claim.
// ============================================================================

import { NextResponse } from "next/server";
import { fetchAllProducts } from "@/lib/data/productFetcher";
import { rowFromProduct } from "@/lib/nutrition/claims";
import { inContext } from "@/lib/screening/relative";
import { latestReference } from "@/lib/screening/categoryReference";

export async function GET(request) {
  if (process.env.KOI_RELATIVE_SCORES !== "on") {
    return NextResponse.json({ enabled: false });
  }

  const skuId = new URL(request.url).searchParams.get("skuId");
  if (!skuId) return NextResponse.json({ error: "skuId is required" }, { status: 400 });

  try {
    const products = await fetchAllProducts();
    const product = products.find((p) => String(p.skuId) === String(skuId));
    if (!product) return NextResponse.json({ error: "No such product" }, { status: 404 });

    const nodeKeys = product.categoryKey ? [...new Set([product.categoryKey, product.categoryKey.split(".")[0]])] : [];
    const references = await latestReference(nodeKeys);
    const context = inContext({ product, row: rowFromProduct(product), references });
    return NextResponse.json({ enabled: true, context }, { headers: { "Cache-Control": "private, max-age=600" } });
  } catch (err) {
    console.error("[products/relative]", err?.message ?? err);
    return NextResponse.json({ enabled: true, context: null });
  }
}
