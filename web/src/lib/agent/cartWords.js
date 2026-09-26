// ============================================================================
// Agent Mode: whether a cart request is the whole plan or particular products.
// Pure. "put it in my cart" / "add the plan to the cart" is the basket
// (add_to_cart); "add 2 packs of oats to my cart" is not (edit_cart). Found in
// the eval, 27 Sep: the second reached for the whole plan.
// ============================================================================

import { norm } from "./evidence";

export function asksForParticularProducts(text) {
  const t = norm(text);
  if (/\b\d+\s*(packs?|pcs|pieces|x)\b|\bpacks? of\b|\bmore\b/.test(t)) return true;
  if (/\b(plan|basket|everything|groceries|the week|the lot|it all|all of it|them all|this list|whole)\b/.test(t)) return false;
  return !/\b(it|them|this|that)\b/.test(t);
}
