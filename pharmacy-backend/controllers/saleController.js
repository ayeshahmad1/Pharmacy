// controllers/saleController.js
const mongoose = require('mongoose');
const Sale = require('../models/Sale');          // make sure this path is correct
const Medicine = require('../models/Medicine');  // and this too
const { allocateBillNumber } = require('../utils/allocateBillNumber');

/**
 * Rs. discount from checkout. If absent, legacy behaviour: 10% of subtotal.
 */
function resolveBillDiscountRs(originalTotal, orderDiscountRsRaw) {
  if (orderDiscountRsRaw != null && orderDiscountRsRaw !== '') {
    const n = Number(orderDiscountRsRaw);
    if (!Number.isFinite(n) || n < 0) {
      return 0;
    }
    const cap = Math.round(originalTotal * 100) / 100;
    return Math.min(Math.max(0, Math.round(n * 100) / 100), cap);
  }
  return Math.round(originalTotal * 0.10 * 100) / 100;
}

function buildPricedLineItems(lineRows, originalTotal, netTotal) {
  let assignedNet = 0;
  return lineRows.map((row, i) => {
    let lineNet;
    if (i === lineRows.length - 1) {
      lineNet = Math.round((netTotal - assignedNet) * 100) / 100;
    } else {
      lineNet = originalTotal > 0
        ? Math.round((row.lineOrigTotal / originalTotal) * netTotal * 100) / 100
        : 0;
      assignedNet += lineNet;
    }
    const discountedPrice = row.quantity > 0
      ? Math.round((lineNet / row.quantity) * 100) / 100
      : 0;
    return {
      medicineId: row.medicineId,
      quantity: row.quantity,
      originalPrice: row.originalPrice,
      discountedPrice
    };
  });
}

/** Fetch meds, stock check, subtotal; apply bill discount; split net across lines. */
async function computeSalePricingFromItems(items, orderDiscountRsRaw, session) {
  const lineRows = [];
  for (const it of items) {
    const qty = Number(it.quantity || 0);
    const medQuery = Medicine.findById(it.medicineId).select('name price quantity');
    if (session) {
      medQuery.session(session);
    }
    const med = await medQuery;

    if (!med) {
      throw new Error(`Medicine with ID ${it.medicineId} not found`);
    }
    if ((med.quantity || 0) < qty) {
      const name = med.name || 'Unknown';
      const available = med.quantity ?? 0;
      throw new Error(`Insufficient stock for ${name}. Available: ${available}, requested: ${qty}`);
    }

    const originalPrice = Number(med.price || 0);
    if (originalPrice <= 0) {
      throw new Error(`Invalid price for medicine ${med.name || it.medicineId}`);
    }

    const roundedOriginalPrice = Math.round(originalPrice * 100) / 100;
    const lineOrigTotal = Math.round(roundedOriginalPrice * qty * 100) / 100;

    lineRows.push({
      medicineId: it.medicineId,
      quantity: qty,
      originalPrice: roundedOriginalPrice,
      lineOrigTotal,
      medName: med.name
    });
  }

  const originalTotal = Math.round(lineRows.reduce((s, r) => s + r.lineOrigTotal, 0) * 100) / 100;
  const totalDiscount = resolveBillDiscountRs(originalTotal, orderDiscountRsRaw);
  const netTotal = Math.round((originalTotal - totalDiscount) * 100) / 100;
  const processedItems = buildPricedLineItems(lineRows, originalTotal, netTotal);

  const stockChecks = lineRows.map((r) => ({
    medicineId: r.medicineId,
    qty: r.quantity,
    name: r.medName
  }));

  return { processedItems, originalTotal, totalDiscount, netTotal, stockChecks };
}

// ===== CREATE SALE (list prices from DB; bill discount from POS or legacy 10%) =====
// POST /api/sales
// Body: items [{ medicineId, quantity }], cashierId, orderDiscountRs? (Rs off subtotal), idempotencyKey?
const createSale = async (req, res) => {
  const { items, cashierId, idempotencyKey } = req.body;

  // Validate input
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'items are required' });
  }
  if (!cashierId) {
    return res.status(400).json({ error: 'cashierId is required' });
  }

  // Validate each item (only medicineId and quantity required)
  for (const it of items) {
    if (!it.medicineId) {
      return res.status(400).json({ error: 'Each item must have a medicineId' });
    }
    if (!mongoose.Types.ObjectId.isValid(it.medicineId)) {
      return res.status(400).json({ error: `Invalid medicineId format: ${it.medicineId}` });
    }
    const qty = Number(it.quantity || 0);
    if (qty <= 0 || !Number.isInteger(qty)) {
      return res.status(400).json({ error: 'Each item must have a positive integer quantity' });
    }
  }

  // Check idempotency: if key exists, return existing sale without decrementing stock
  if (idempotencyKey) {
    const existingSale = await Sale.findOne({ idempotencyKey })
      .populate({
        path: 'cashierId',
        select: 'name',
        model: 'User'
      })
      .populate('items.medicineId', 'name');
    
    if (existingSale) {
      return res.status(200).json(existingSale);
    }
  }

  // Use transaction when available (Atlas / replica set). Fall back if not.
  const session = await mongoose.startSession();
  try {
    let createdSale;

    await session.withTransaction(async () => {
      const {
        processedItems,
        originalTotal,
        totalDiscount,
        netTotal,
        stockChecks
      } = await computeSalePricingFromItems(items, req.body.orderDiscountRs, session);

      const billNumber = await allocateBillNumber(session);

      const saleData = {
        items: processedItems,
        originalTotal,
        totalDiscount,
        netTotal,
        totalPrice: netTotal,
        billNumber,
        cashierId,
        idempotencyKey: idempotencyKey || undefined
      };

      const [saleDoc] = await Sale.create([saleData], { session });
      createdSale = saleDoc._id;

      for (const check of stockChecks) {
        const updated = await Medicine.findOneAndUpdate(
          { _id: check.medicineId, quantity: { $gte: check.qty } },
          { $inc: { quantity: -check.qty } },
          { session }
        );

        if (!updated) {
          const med = await Medicine.findById(check.medicineId).session(session).select('name quantity');
          const name = med?.name || 'Unknown';
          const available = med?.quantity ?? 0;
          throw new Error(`Stock check failed for ${name}. Available: ${available}, requested: ${check.qty}`);
        }
      }
    });

    // 3) Populate for the client
    const populated = await Sale.findById(createdSale)
      .populate({
        path: 'cashierId',
        select: 'name',
        model: 'User'
      })
      .populate('items.medicineId', 'name');

    return res.status(201).json(populated);
  } catch (err) {
    // Idempotency race: a concurrent request with the same key already created the
    // sale (e.g. an auto-retry that overlapped the original). Return that sale as
    // success instead of failing — stock was deducted exactly once by the winner.
    if (idempotencyKey && (err?.code === 11000 || /E11000/i.test(String(err?.message || '')))) {
      const existing = await Sale.findOne({ idempotencyKey })
        .populate({ path: 'cashierId', select: 'name', model: 'User' })
        .populate('items.medicineId', 'name');
      if (existing) {
        return res.status(200).json(existing);
      }
    }

    // Fallback for non-transaction environments (e.g., local single node)
    const msg = String(err && err.message || '');
    const looksLikeTxnUnsupported = /Transaction|replica set|not a replica set/i.test(msg);

    if (looksLikeTxnUnsupported) {
      try {
        let pricing;
        try {
          pricing = await computeSalePricingFromItems(items, req.body.orderDiscountRs, null);
        } catch (calcErr) {
          const m = String(calcErr.message || '');
          if (/not found/i.test(m)) {
            return res.status(404).json({ error: m });
          }
          return res.status(400).json({ error: m });
        }

        const {
          processedItems,
          originalTotal,
          totalDiscount,
          netTotal,
          stockChecks
        } = pricing;

        const billNumber = await allocateBillNumber();

        // Step 2: Create sale document
        let sale;
        try {
          sale = await Sale.create({
            items: processedItems,
            originalTotal,
            totalDiscount,
            netTotal,
            totalPrice: netTotal,
            billNumber,
            cashierId,
            idempotencyKey: idempotencyKey || undefined
          });
        } catch (saleError) {
          return res.status(500).json({ error: `Failed to create sale: ${saleError.message}` });
        }

        // Step 3: Decrement stock AFTER sale is created (rollback on failure)
        const succeeded = [];
        try {
          for (const check of stockChecks) {
            const upd = await Medicine.updateOne(
              { _id: check.medicineId, quantity: { $gte: check.qty } },
              { $inc: { quantity: -check.qty } }
            );

            if (upd.modifiedCount !== 1) {
              // Rollback stock increments for already decremented items
              for (const ok of succeeded) {
                await Medicine.updateOne({ _id: ok.medicineId }, { $inc: { quantity: ok.qty } });
              }
              // Delete the sale document
              await Sale.findByIdAndDelete(sale._id);
              return res.status(400).json({ error: `Stock check failed for ${check.name}. Please try again.` });
            }
            succeeded.push({ medicineId: check.medicineId, qty: check.qty });
          }
        } catch (stockError) {
          // Rollback stock increments
          for (const ok of succeeded) {
            await Medicine.updateOne({ _id: ok.medicineId }, { $inc: { quantity: ok.qty } });
          }
          // Delete the sale document
          await Sale.findByIdAndDelete(sale._id);
          throw stockError;
        }

        const populated = await Sale.findById(sale._id)
          .populate({
            path: 'cashierId',
            select: 'name',
            model: 'User'
          })
          .populate('items.medicineId', 'name');
        return res.status(201).json(populated);
      } catch (e2) {
        // If we get here and succeeded array has items, they should already be rolled back
        // But add extra safety check
        return res.status(500).json({ error: e2.message });
      }
    }

    return res.status(400).json({ error: msg || 'Failed to create sale' });
  } finally {
    session.endSession();
  }
};

// ===== LIST ALL SALES =====
// GET /api/sales
const getSales = async (req, res) => {
  try {
    const sales = await Sale.find({})
      .populate({
        path: 'cashierId',
        select: 'name',
        model: 'User'
      })
      .populate('items.medicineId', 'name')
      .sort({ createdAt: -1 });
    res.json(sales);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ===== SALES BY DATE (for End Day modal/print) =====
// GET /api/sales/by-date?date=YYYY-MM-DD
const getSalesByDate = async (req, res) => {
  try {
    const { date } = req.query;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Provide date as YYYY-MM-DD' });
    }
    const [y, m, d] = date.split('-').map(Number);
    const start = new Date(y, m - 1, d, 0, 0, 0, 0);
    const end   = new Date(y, m - 1, d, 23, 59, 59, 999);

    const sales = await Sale.find({ createdAt: { $gte: start, $lte: end } })
      .populate({
        path: 'cashierId',
        select: 'name',
        model: 'User'
      })
      .populate('items.medicineId', 'name')
      .sort({ createdAt: 1 });

    // Use netTotal for returns (negative) and regular sales (positive)
    const total = sales.reduce((sum, s) => sum + Number(s.netTotal || s.totalPrice || 0), 0);
    res.json({ date, count: sales.length, total, sales });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ===== CLOSE DAY (delete those sales after showing/printing) =====
// POST /api/sales/close-day  { date: "YYYY-MM-DD" }
const closeDayByDate = async (req, res) => {
  const { date } = req.body;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'Provide date as YYYY-MM-DD' });
  }
  const [y, m, d] = date.split('-').map(Number);
  const start = new Date(y, m - 1, d, 0, 0, 0, 0);
  const end   = new Date(y, m - 1, d, 23, 59, 59, 999);

  // Get sales with populated data first (before transaction)
  const sales = await Sale.find({ createdAt: { $gte: start, $lte: end } })
    .populate({
      path: 'cashierId',
      select: 'name',
      model: 'User'
    })
    .populate('items.medicineId', 'name')
    .sort({ createdAt: 1 });

  // Use netTotal for new sales, fallback to totalPrice for old sales (backward compatibility)
  const total = sales.reduce((sum, s) => sum + Number(s.netTotal || s.totalPrice || 0), 0);
  const salesData = { date, count: sales.length, total, sales };

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      // 1) Restore stock for all items in all sales before deleting
      for (const sale of sales) {
        for (const item of sale.items) {
          const qty = Number(item.quantity || 0);
          if (qty > 0 && item.medicineId) {
            // Handle both ObjectId and populated object
            const medicineId = item.medicineId._id || item.medicineId;
            // Undo sale: add stock back. Undo return: remove stock that was restocked.
            const delta = sale.isReturn ? -qty : qty;
            await Medicine.findByIdAndUpdate(
              medicineId,
              { $inc: { quantity: delta } },
              { session }
            );
          }
        }
      }

      // 2) Delete sales in the same transaction
      const ids = sales.map(s => s._id);
      if (ids.length) {
        await Sale.deleteMany({ _id: { $in: ids } }).session(session);
      }
    });

    return res.json(salesData);
  } catch (err) {
    // Fallback for non-transaction environments
    const msg = String(err && err.message || '');
    const looksLikeTxnUnsupported = /Transaction|replica set|not a replica set/i.test(msg);

    if (looksLikeTxnUnsupported) {
      try {
        const sales = await Sale.find({ createdAt: { $gte: start, $lte: end } })
          .populate({
            path: 'cashierId',
            select: 'name',
            model: 'User'
          })
          .populate('items.medicineId', 'name')
          .sort({ createdAt: 1 });

        // Restore stock for all items
        for (const sale of sales) {
          for (const item of sale.items) {
            const qty = Number(item.quantity || 0);
            if (qty > 0 && item.medicineId) {
              const medicineId = item.medicineId._id || item.medicineId;
              const delta = sale.isReturn ? -qty : qty;
              await Medicine.findByIdAndUpdate(
                medicineId,
                { $inc: { quantity: delta } }
              );
            }
          }
        }

        // Use netTotal for new sales, fallback to totalPrice for old sales
        const total = sales.reduce((sum, s) => sum + Number(s.netTotal || s.totalPrice || 0), 0);
        const ids = sales.map(s => s._id);
        if (ids.length) {
          await Sale.deleteMany({ _id: { $in: ids } });
        }

        return res.json({ date, count: sales.length, total, sales });
      } catch (e2) {
        return res.status(500).json({ error: e2.message });
      }
    }

    return res.status(500).json({ error: msg || 'Failed to close day' });
  } finally {
    session.endSession();
  }
};

module.exports = {
  createSale,
  getSales,
  getSalesByDate,
  closeDayByDate,
};
