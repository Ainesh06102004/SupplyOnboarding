// ============================================================================
// KOI — Mock supply fixtures
//
// What a grocery marketplace's search would plausibly return: everyday Indian
// q-commerce staples, named the way a provider names them, with pack size
// inline rather than as a separate field.
//
// These are DELIBERATELY not KOI's catalogue. If the mock only returned
// products KOI already knows, the matching and enrichment code would never be
// exercised and would break the first time a real provider answered. A real
// shelf query returns mostly things KOI has not screened, and the storefront
// has to cope with that.
//
// Note what is missing: no nutrition, no ingredients, no claims, no score. The
// contract has no field for them and neither does this file. KOI supplies all
// of that from its own screening, or the product renders without it.
// ============================================================================

/**
 * @type {Array<{
 *   externalId: string, variantRef: string|null, rawName: string,
 *   rawBrand: string|null, rawPackSize: string|null, price: number, mrp: number
 * }>}
 */
export const FIXTURE_POOL = [
  { externalId: "SPN10001", variantRef: "SKU10001", rawName: "Amul Masti Dahi 400 g", rawBrand: "Amul", rawPackSize: "400 g", price: 45, mrp: 50 },
  { externalId: "SPN10002", variantRef: "SKU10002", rawName: "Epigamia Greek Yogurt Natural 400 g", rawBrand: "Epigamia", rawPackSize: "400 g", price: 130, mrp: 145 },
  { externalId: "SPN10003", variantRef: "SKU10003", rawName: "Milky Mist Paneer 200 g", rawBrand: "Milky Mist", rawPackSize: "200 g", price: 99, mrp: 110 },
  { externalId: "SPN10004", variantRef: "SKU10004", rawName: "Nutrela Soya Chunks 200 g", rawBrand: "Nutrela", rawPackSize: "200 g", price: 52, mrp: 55 },
  { externalId: "SPN10005", variantRef: "SKU10005", rawName: "Pintola All Natural Peanut Butter Crunchy 1 kg", rawBrand: "Pintola", rawPackSize: "1 kg", price: 489, mrp: 650 },
  { externalId: "SPN10006", variantRef: "SKU10006", rawName: "Saffola Oats 1 kg", rawBrand: "Saffola", rawPackSize: "1 kg", price: 199, mrp: 225 },
  { externalId: "SPN10007", variantRef: "SKU10007", rawName: "Tata Sampann Unpolished Toor Dal 1 kg", rawBrand: "Tata Sampann", rawPackSize: "1 kg", price: 189, mrp: 210 },
  { externalId: "SPN10008", variantRef: "SKU10008", rawName: "24 Mantra Organic Ragi Flour 500 g", rawBrand: "24 Mantra", rawPackSize: "500 g", price: 85, mrp: 95 },
  { externalId: "SPN10009", variantRef: "SKU10009", rawName: "Yoga Bar Multigrain Energy Bar Pack of 6", rawBrand: "Yoga Bar", rawPackSize: "6 x 38 g", price: 350, mrp: 400 },
  { externalId: "SPN10010", variantRef: "SKU10010", rawName: "Whole Farm Almonds 500 g", rawBrand: "Whole Farm", rawPackSize: "500 g", price: 449, mrp: 550 },
  { externalId: "SPN10011", variantRef: "SKU10011", rawName: "Fortune Kachi Ghani Mustard Oil 1 L", rawBrand: "Fortune", rawPackSize: "1 L", price: 175, mrp: 190 },
  { externalId: "SPN10012", variantRef: "SKU10012", rawName: "Amul Gold Full Cream Milk 500 ml", rawBrand: "Amul", rawPackSize: "500 ml", price: 33, mrp: 33 },
  { externalId: "SPN10013", variantRef: "SKU10013", rawName: "Britannia Nutrichoice Digestive 250 g", rawBrand: "Britannia", rawPackSize: "250 g", price: 55, mrp: 60 },
  { externalId: "SPN10014", variantRef: "SKU10014", rawName: "Farm Fresh Eggs Pack of 12", rawBrand: null, rawPackSize: "12 pcs", price: 89, mrp: 95 },
  { externalId: "SPN10015", variantRef: "SKU10015", rawName: "Organic Tattva Quinoa 500 g", rawBrand: "Organic Tattva", rawPackSize: "500 g", price: 275, mrp: 320 },
  { externalId: "SPN10016", variantRef: "SKU10016", rawName: "Dabur Honey 250 g", rawBrand: "Dabur", rawPackSize: "250 g", price: 165, mrp: 180 },
  { externalId: "SPN10017", variantRef: "SKU10017", rawName: "Nandini Curd 500 g", rawBrand: "Nandini", rawPackSize: "500 g", price: 30, mrp: 32 },
  { externalId: "SPN10018", variantRef: "SKU10018", rawName: "MTR Roasted Vermicelli 900 g", rawBrand: "MTR", rawPackSize: "900 g", price: 120, mrp: 135 },
  { externalId: "SPN10019", variantRef: "SKU10019", rawName: "Tofu Fresh Block 200 g", rawBrand: null, rawPackSize: "200 g", price: 95, mrp: 110 },
  { externalId: "SPN10020", variantRef: "SKU10020", rawName: "Sprouted Moong 250 g", rawBrand: null, rawPackSize: "250 g", price: 40, mrp: 45 },
  { externalId: "SPN10021", variantRef: "SKU10021", rawName: "Kellogg's Muesli Fruit & Nut 750 g", rawBrand: "Kellogg's", rawPackSize: "750 g", price: 425, mrp: 495 },
  { externalId: "SPN10022", variantRef: "SKU10022", rawName: "Chia Seeds 200 g", rawBrand: "True Elements", rawPackSize: "200 g", price: 190, mrp: 225 },
  { externalId: "SPN10023", variantRef: "SKU10023", rawName: "Cold Pressed Coconut Oil 500 ml", rawBrand: "Max Care", rawPackSize: "500 ml", price: 215, mrp: 250 },
  { externalId: "SPN10024", variantRef: "SKU10024", rawName: "Bagrry's White Oats 1 kg", rawBrand: "Bagrry's", rawPackSize: "1 kg", price: 235, mrp: 275 },
];

/**
 * Areas the mock refuses to serve, so `not_serviceable` is a state the UI has
 * actually been built and seen — not a branch discovered in production.
 */
export const NOT_SERVICEABLE_PINCODES = ["110001", "781001", "744101"];
