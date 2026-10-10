# One shell, one cart: research notes

10 Oct 2026. Short on purpose: each finding ends in the decision it drives. **Baymard's guideline text is paywalled.** Where only its issue statement and example catalogue were readable, that is said, and secondary sources are labelled as vendor or practitioner material.

---

## 1. Cart drawer or cart page: both, as one component

**Findings**
- Vendor material is consistent that a drawer keeps the shopper on the page and keeps their scroll position, so a second add is one click.
  - Its conversion figures (5–25%) have no visible method and are not used here.
- A full cart page still earns its place for large baskets, and it gives a shareable URL.
- The common recommendation is a hybrid: a drawer by default, with a link to the full cart.
- Sources: [Carty Labs](https://cartylabs.com/blog/shopify-cart-page-vs-cart-drawer/), [ninety9](https://ninety9.dev/blog/cart-drawer-vs-cart-page.html).

**Decision**
- **`CartSheet`** is opened by the header cart button and by every add confirmation.
  - On desktop, a right drawer; on phones, a bottom sheet.
- **`/store/cart`** is the full page.
- **Both render the same `CartView`**, and so does the Plan's Cart step. A plan basket of 14+ lines is a large cart, so the Plan step uses the page-width layout, not the drawer.

## 2. Add-to-cart confirmation must name the item and the next step

**Findings**
- Baymard's catalogue frames an "Added to cart" overlay as highly effective when it lets shoppers check the item and the key order details.
- Overlays that drop the item's details lose shoppers' confidence.
- Ambiguous next-step labels slowed test participants down.
- Source: [Baymard: added-to-cart confirmation examples](https://baymard.com/ecommerce-design-examples/added-to-cart-confirmation).

**Decision**
- **`AddedToast`** shows the thumbnail, name and pack, and the new line quantity.
- It has two explicit actions: **View cart** (opens the sheet) and **Checkout**.
- It auto-dismisses and never blocks the page.
- Toast copy doesn't repeat prices; the sheet shows them.

## 3. Cart keeps the site; checkout encloses it

**Findings**
- Baymard's enclosed-checkout guideline (#606, updated Jul 2026) names the issue: *"Users can be distracted during the checkout process by dominant noncheckout elements such as the main site navigation."*
- A Salesforce playbook citing Baymard click data says:
  - keep the main navigation and search on the **cart**, because shoppers return to it to review;
  - switch to an alternate header **once checkout starts**, keeping the logo as the way home, plus help links.
- A practitioner caveat: unclear totals and surprise costs distract more than navigation does.
- Sources: [Baymard #606](https://baymard.com/guidelines/606-enclosed-checkout-design), [Econsultancy](https://econsultancy.com/why-online-retailers-should-enclose-the-checkout-process/), [Salesforce B2C playbook (PDF)](https://resources.docs.salesforce.com/rel1/doc/en-us/static/pdf/B2CCommerceUXPlaybook-OptimizationsfortheCheckoutFlow.pdf), [Atticus Li](https://atticusli.com/blog/posts/checkout-page-design-experiment-evidence/).

**Decision**
- **`StoreHeader` variant `focused`** on `/store/checkout` shows:
  - the logo (the way out);
  - the progress Cart › Checkout › Hand-off;
  - "Back to cart".
- No tab bar, no agent dock pill, no search.
- The cart page keeps the full header.

## 4. Never surprise on cost

**Findings**
- Vendor material repeatedly cites Baymard's finding that extra costs are the top non-browsing reason for abandoning. The secondhand figure is 40%, and it could not be confirmed on baymard.com.

**Decision**
- KOI cannot know Swiggy's fees, so the cart and checkout say so once and plainly: **"MRP total · Swiggy shows the final price, fees and delivery before you pay."**
- The cart page's "Delivery Fee: Free" is removed. It is a claim KOI cannot make; checkout had already removed it.

## 5. Planner to cart: subtract what's at home, keep the link to the plan

**Findings**
- Meal-planner tools that hand a list to a grocer:
  - net out what the household already has before the hand-off;
  - offer a per-item "I already have this" switch;
  - merge duplicates across recipes;
  - keep the list tied to the plan selected.
- Sources: [AislePrompt features](https://aisleprompt.com/features), [Plan to Eat](https://learn.plantoeat.com/doc/add-ingredients-and-notes-to-the-planner), [Everfit](https://help.everfit.io/en/articles/9919401-meal-planner-shopping-list), [Obsidian Pantry](https://www.obsidianstats.com/plugins/pantry).

**Decision**
- **Pantry already has "Have it"** (`have` → zero packs). The cart receives the remainder.
- **The cart remembers which plan filled it** (`plan: {planId, signature}`) and how many packs of each line came from the plan (`fromPlan`). That gives three properties:
  - adding twice replaces, it doesn't double;
  - the shopper's own extras survive a plan update;
  - a changed plan is detected by its signature and offered as an update ("2 added, 1 removed · Update cart"), never applied silently.

## 6. Mobile: thumb reach, sheets, one bottom stack

**Findings**
- Indian quick-commerce apps use bottom sheets for details, so the flow is never interrupted. The source is an inspiration gallery, not a teardown.
- General sticky-cart guidance:
  - bottom-centre placement;
  - targets of at least 44 × 44;
  - subtle enough not to compete with the main CTA.
- Order-summary pattern: on desktop, a sticky right rail. On mobile, a compact total bar with an expand chevron.
- Sources: [AppStorys: Zepto](https://appstorys.com/inspiration-gallery/zepto), [Custody](https://custodydesign.com/blog/custody-sticky-cart-footer-for-shopify-documentation/), [ecommerceguide: order summary](https://ecommerceguide.com/patterns/order-summary/).

**Decision**
- **One bottom stack on phones, defined by the variable `--koi-bottom-chrome`.** Everything that floats sits on top of it:
  - `MobileTabBar` (Home · Shop · Plan · Cart · You);
  - above the tab bar, either the agent dock pill or a page's sticky total bar, never both at the same height.
- **`MiniCart` is removed;** the tab bar's Cart opens `CartSheet`.
- **The cart page** has a sticky total bar on phones and a sticky summary rail on desktop.

---

## What this does not change

- **The Plan's look**, which the founder's design set: off-white, hairline white cards, Space Grotesk figures, Plex Mono labels. It becomes the app language; it is not replaced.
- **The marketplace seam.** Checkout is still prepare → review → commit → hand-off to Swiggy. KOI takes no payment.
- **Agent Mode's invariant: the cart always asks.** The dock's cart approval now writes through the same `applyPlan` as the Pantry button.
