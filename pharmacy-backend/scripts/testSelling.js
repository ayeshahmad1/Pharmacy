/**
 * Inventory-deduction test harness for the SELLING workflow.
 *
 * Runs against an ISOLATED test database (dbName: pharmacy_selltest) on the same
 * cluster — it never touches live data, and drops itself when finished.
 *
 * It calls the REAL createSale controller so the actual transaction / atomic-update
 * / idempotency code paths are exercised.
 *
 *   node scripts/testSelling.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

const TEST_DB = 'pharmacy_selltest';

let passed = 0;
let failed = 0;
function assert(cond, label) {
  if (cond) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; console.error(`  ✗ FAIL: ${label}`); }
}

// Minimal mock of an Express response object.
function mockRes() {
  return {
    statusCode: 200,
    body: undefined,
    status(c) { this.statusCode = c; return this; },
    json(o) { this.body = o; return this; },
  };
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI, { dbName: TEST_DB });
  console.log(`Connected to test db "${mongoose.connection.name}" (isolated).\n`);

  const Medicine = require('../models/Medicine');
  const Sale = require('../models/Sale');
  const User = require('../models/User');
  const BillSequence = require('../models/BillSequence');
  const { createSale } = require('../controllers/saleController');

  // Clean slate
  await Promise.all([
    Medicine.deleteMany({}), Sale.deleteMany({}),
    User.deleteMany({}), BillSequence.deleteMany({}),
  ]);

  const cashier = await User.create({ name: 'Test Cashier', email: 'selltest@example.com', password: 'x', role: 'cashier' });

  const mkMed = (name, qty, price = 10) => Medicine.create({ name, quantity: qty, price, type: 'tablet' });
  const qtyOf = async (id) => (await Medicine.findById(id)).quantity;

  async function sell(medId, quantity, idempotencyKey) {
    const req = { body: { items: [{ medicineId: String(medId), quantity }], cashierId: String(cashier._id), idempotencyKey } };
    const res = mockRes();
    await createSale(req, res);
    return res;
  }

  // ── Scenario 1: exact sequential deduction ─────────────────────────────
  console.log('Scenario 1 — exact sequential deduction (50→45→25→0→reject)');
  {
    const m = await mkMed('Paracetamol', 50);
    let r = await sell(m._id, 5);
    assert(r.statusCode === 201 && await qtyOf(m._id) === 45, 'Stock 50 − 5 = 45');
    r = await sell(m._id, 20);
    assert(r.statusCode === 201 && await qtyOf(m._id) === 25, 'Stock 45 − 20 = 25');
    r = await sell(m._id, 25);
    assert(r.statusCode === 201 && await qtyOf(m._id) === 0, 'Stock 25 − 25 = 0');
    r = await sell(m._id, 1);
    assert(r.statusCode >= 400 && await qtyOf(m._id) === 0, 'Stock 0, sell 1 → rejected, stays 0');
    assert(/insufficient/i.test(JSON.stringify(r.body)), 'Rejection message mentions insufficient stock');
  }

  // ── Scenario 2: multiple medicines in one sale ─────────────────────────
  console.log('\nScenario 2 — one sale, multiple medicines');
  {
    const a = await mkMed('Amoxicillin', 30);
    const b = await mkMed('Ibuprofen', 40);
    const req = { body: { items: [
      { medicineId: String(a._id), quantity: 7 },
      { medicineId: String(b._id), quantity: 12 },
    ], cashierId: String(cashier._id) } };
    const res = mockRes();
    await createSale(req, res);
    assert(res.statusCode === 201, 'Multi-item sale succeeded');
    assert(await qtyOf(a._id) === 23, 'Med A 30 − 7 = 23');
    assert(await qtyOf(b._id) === 28, 'Med B 40 − 12 = 28');
  }

  // ── Scenario 3: partial failure rolls back the WHOLE sale ──────────────
  console.log('\nScenario 3 — one item short → entire sale rolls back (no partial deduction)');
  {
    const a = await mkMed('Vitamin C', 10);
    const b = await mkMed('Zinc', 3);
    const req = { body: { items: [
      { medicineId: String(a._id), quantity: 5 },   // available
      { medicineId: String(b._id), quantity: 8 },   // NOT available
    ], cashierId: String(cashier._id) } };
    const res = mockRes();
    await createSale(req, res);
    assert(res.statusCode >= 400, 'Sale rejected');
    assert(await qtyOf(a._id) === 10, 'Available item NOT deducted (rollback): still 10');
    assert(await qtyOf(b._id) === 3, 'Short item unchanged: still 3');
    const saleCount = await Sale.countDocuments({});
    // no sale doc should remain for this failed attempt beyond scenario 1 & 2 sales
  }

  // ── Scenario 4: idempotency — same key twice deducts once ──────────────
  console.log('\nScenario 4 — duplicate request with SAME idempotency key deducts once');
  {
    const m = await mkMed('Cetirizine', 20);
    const key = 'dup-key-123';
    const r1 = await sell(m._id, 6, key);
    const r2 = await sell(m._id, 6, key);
    assert(r1.statusCode === 201, 'First request created sale');
    assert(r2.statusCode === 200, 'Second request returned existing sale (not re-created)');
    assert(await qtyOf(m._id) === 14, 'Stock deducted ONCE: 20 − 6 = 14');
    const sales = await Sale.countDocuments({ idempotencyKey: key });
    assert(sales === 1, 'Only one sale doc for the key');
  }

  // ── Scenario 5: double-submit with DIFFERENT keys (double-click) ───────
  console.log('\nScenario 5 — two submits with DIFFERENT keys (simulates rapid double-click)');
  {
    const m = await mkMed('Loratadine', 20);
    await sell(m._id, 6, 'click-A-' + Date.now());
    await new Promise(r => setTimeout(r, 2));
    await sell(m._id, 6, 'click-B-' + Date.now());
    const q = await qtyOf(m._id);
    console.log(`     → resulting stock: ${q} (20 − 6 − 6 = 8)`);
    assert(q === 8, 'Backend processes both as distinct sales (→ frontend must block double-click)');
  }

  // ── Scenario 6: concurrent oversell can NEVER go negative ──────────────
  console.log('\nScenario 6 — 10 concurrent sells of 1 unit against stock of 5');
  {
    const m = await mkMed('Omeprazole', 5);
    const attempts = Array.from({ length: 10 }, (_, i) => sell(m._id, 1, `conc-${i}-${Date.now()}`));
    const results = await Promise.all(attempts);
    const ok = results.filter(r => r.statusCode === 201).length;
    const rejected = results.filter(r => r.statusCode >= 400).length;
    const finalQty = await qtyOf(m._id);
    console.log(`     → succeeded: ${ok}, rejected: ${rejected}, final stock: ${finalQty}`);
    assert(finalQty === 0, 'Final stock is exactly 0 (never negative)');
    assert(ok === 5, 'Exactly 5 sales succeeded');
    assert(finalQty >= 0, 'Stock never went negative');
  }

  // ── Scenario 7: concurrent requests with the SAME key (auto-retry overlap) ──
  console.log('\nScenario 7 — 5 CONCURRENT requests sharing one idempotency key');
  {
    const m = await mkMed('Amlodipine', 30);
    const key = 'race-key-' + Date.now();
    const results = await Promise.all(Array.from({ length: 5 }, () => sell(m._id, 4, key)));
    const errored = results.filter(r => r.statusCode >= 400).length;
    const saleDocs = await Sale.countDocuments({ idempotencyKey: key });
    const finalQty = await qtyOf(m._id);
    console.log(`     → error responses: ${errored}, sale docs: ${saleDocs}, final stock: ${finalQty}`);
    assert(saleDocs === 1, 'Exactly ONE sale created for the shared key');
    assert(finalQty === 26, 'Stock deducted exactly once: 30 − 4 = 26');
    assert(errored === 0, 'No request returned an error (race resolved to the existing sale)');
  }

  console.log(`\n──────────────────────────────\nPASSED: ${passed}  FAILED: ${failed}`);

  await mongoose.connection.dropDatabase();
  console.log(`Dropped test db "${TEST_DB}".`);
  await mongoose.disconnect();
  process.exit(failed ? 1 : 0);
}

main().catch(async (e) => {
  console.error('Test harness error:', e);
  try { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); } catch {}
  process.exit(1);
});
