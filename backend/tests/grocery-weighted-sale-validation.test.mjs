import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GROCERY_SUPPORTED_UNITS,
  groceryScaleMetadata,
  isThreeDecimalQuantity,
  validateScaleMetadata,
} from '../dist/middleware/grocery-sale-validation.middleware.js';

test('Grocery quantities allow up to three decimals', () => {
  assert.equal(isThreeDecimalQuantity(1), true);
  assert.equal(isThreeDecimalQuantity(0.125), true);
  assert.equal(isThreeDecimalQuantity(1.234), true);
  assert.equal(isThreeDecimalQuantity(1.2345), false);
});

test('Grocery supported units include measured and packaged units', () => {
  for (const unit of ['pcs', 'pack', 'box', 'tray', 'dozen', 'kg', 'g', 'l', 'ml']) {
    assert.equal(GROCERY_SUPPORTED_UNITS.has(unit), true, unit);
  }
});

test('Scale metadata can be supplied through supported payload aliases', () => {
  assert.deepEqual(groceryScaleMetadata({ scaleBarcode: { barcode: '2100010012500' } }), { barcode: '2100010012500' });
  assert.deepEqual(groceryScaleMetadata({ metadata: { scaleBarcode: { barcode: '2100010012500' } } }), { barcode: '2100010012500' });
  assert.equal(groceryScaleMetadata({}), null);
});

test('Weight-embedded barcode must match the posted quantity', () => {
  const valid = { rawBarcode: '2100010012500', mode: 'weight', weight: 1.25 };
  assert.equal(validateScaleMetadata(valid, 1.25), null);
  assert.match(validateScaleMetadata(valid, 1.5), /does not match/);
});

test('Scale metadata rejects invalid formats and modes', () => {
  assert.match(validateScaleMetadata({ rawBarcode: 'ABC', mode: 'weight', weight: 1 }, 1), /invalid scale barcode/);
  assert.match(validateScaleMetadata({ rawBarcode: '2100010012500', mode: 'unknown', weight: 1 }, 1), /mode must be weight or price/);
  assert.match(validateScaleMetadata({ rawBarcode: '2100010012500', mode: 'price', price: 0 }, 1), /must be positive/);
});
