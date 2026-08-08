import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const product = read("src/controllers/grocery-product-uom.controller.ts");
const priceHistory = read("src/controllers/grocery-price-profile-history.controller.ts");
const purchase = read("src/controllers/grocery-purchase-uom.controller.ts");
const routes = read("src/routes/grocery-cheques.routes.ts");
const sales = read("src/controllers/grocery-sales.controller.ts");

test("Grocery product profile exposes multiple barcodes PLU UOM and embedded barcode controls", () => {
  for (const token of ["barcodes", "plu", "weightedBarcode", "weightedBarcodePrefix", "priceEmbeddedBarcode", "priceEmbeddedBarcodePrefix", "baseUnit", "uoms", "retailPrice", "wholesalePrice", "memberPrice", "promotionalPrice", "minimumSellingPrice", "margin", "markup"]) assert.ok(product.includes(token), `missing ${token}`);
  assert.match(product, /uomConversions/);
  assert.match(product, /weightedProduct/);
  assert.match(product, /2–8 digits/);
  assert.match(product, /already belongs to/);
});

test("embedded barcode lookup decodes weighted quantity and embedded price", () => {
  assert.match(product, /barcodeType: "price_embedded"/);
  assert.match(product, /barcodeType: "weighted"/);
  assert.match(product, /raw \/ 100/);
  assert.match(product, /raw \/ 1000/);
});

test("purchase order stores purchase UOM and base-unit conversion", () => {
  assert.match(purchase, /uomMultiplier/);
  assert.match(purchase, /baseQuantity/);
  assert.match(purchase, /costPerBaseUnit/);
  assert.match(purchase, /quantity \* resolved\.multiplier/);
  assert.match(purchase, /costPerPurchaseUnit \/ resolved\.multiplier/);
  assert.match(purchase, /uomAccountingVersion: 1/);
});

test("GRN records purchase quantity but posts base quantity to inventory", () => {
  assert.match(purchase, /qty: i\.purchaseQty/);
  assert.match(purchase, /qtyOnHandBase: item\.baseQty/);
  assert.match(purchase, /qtyOnHand: item\.baseQty/);
  assert.match(purchase, /currentStock: \{ increment: item\.baseQty \}/);
  assert.match(purchase, /qty: item\.baseQty/);
  assert.match(purchase, /purchaseQuantity: item\.purchaseQty/);
  assert.match(purchase, /purchaseUom: item\.uom/);
  assert.match(purchase, /costPerBaseUnit: item\.costPerBaseUnit/);
});

test("Grocery routes preserve UOM-aware profile PO and receiving handlers through price-history wrapper", () => {
  assert.match(routes, /groceryProductLookupUom/);
  assert.match(routes, /saveGroceryProductProfileWithPriceHistory/);
  assert.match(priceHistory, /saveGroceryProductProfileUom/);
  assert.match(priceHistory, /await saveGroceryProductProfileUom\(req, capture as Response\)/);
  assert.match(routes, /groceryCreatePurchaseOrderUom/);
  assert.match(routes, /groceryReceivePurchaseUom/);
  assert.doesNotMatch(routes, /router\.post\("\/purchase-orders"[^\n]+groceryCreatePurchaseOrder\)/);
  assert.doesNotMatch(routes, /router\.post\("\/purchase-orders\/:id\/receive"[^\n]+groceryReceivePurchaseWithAccounting\)/);
});

test("sales retain a Grocery COGS snapshot for accounting", () => {
  assert.match(sales, /groceryCostSnapshot/);
  assert.match(sales, /postGrocerySaleAccounting/);
});
