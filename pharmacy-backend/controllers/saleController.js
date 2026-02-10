// controllers/saleController.js
const mongoose = require('mongoose');
const Sale = require('../models/Sale');          // make sure this path is correct
const Medicine = require('../models/Medicine');  // and this too

// ===== CREATE SALE (decrement stock safely) =====
// POST /api/sales
const createSale = async (req, res) => {
  const { items, totalPrice, cashierId } = req.body;
  console.log('req.body', req.body);
  

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'items are required' });
  }
  if (!cashierId) {
    return res.status(400).json({ error: 'cashierId is required' });
  }
  if (typeof totalPrice !== 'number' || totalPrice < 0) {
    return res.status(400).json({ error: 'totalPrice must be a valid non-negative number' });
  }

  // Validate each item
  for (const it of items) {
    if (!it.medicineId) {
      return res.status(400).json({ error: 'Each item must have a medicineId' });
    }
    // Validate medicineId is a valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(it.medicineId)) {
      return res.status(400).json({ error: `Invalid medicineId format: ${it.medicineId}` });
    }
    const qty = Number(it.quantity || 0);
    if (qty <= 0 || !Number.isInteger(qty)) {
      return res.status(400).json({ error: 'Each item must have a positive integer quantity' });
    }
    if (typeof it.price !== 'number' || it.price < 0 || isNaN(it.price)) {
      return res.status(400).json({ error: 'Each item must have a valid non-negative price' });
    }
  }

  // Optional: Validate that totalPrice matches calculated total (with small tolerance for rounding)
  const calculatedTotal = items.reduce((sum, it) => sum + (Number(it.quantity || 0) * Number(it.price || 0)), 0);
  const priceDifference = Math.abs(calculatedTotal - totalPrice);
  if (priceDifference > 0.01) { // Allow 1 cent tolerance for rounding
    console.warn(`Price mismatch: calculated=${calculatedTotal}, provided=${totalPrice}`);
    // Don't reject, but log warning - frontend might have rounding differences
  }

  // Use transaction when available (Atlas / replica set). Fall back if not.
  const session = await mongoose.startSession();
  try {
    let createdSale;

    await session.withTransaction(async () => {
      // 1) Check and decrement each item atomically
      for (const it of items) {
        const qty = Number(it.quantity || 0);
        if (!it.medicineId || qty <= 0) {
          throw new Error('Invalid item in sale payload');
        }

        console.log(`Decrementing ${it.medicineId} by ${qty}`);
        
        const updated = await Medicine.findOneAndUpdate(
          { _id: it.medicineId, quantity: { $gte: qty } },
          { $inc: { quantity: -qty } },
          { new: true, session, projection: { _id: 1, name: 1, quantity: 1 } }
        );

        console.log('Updated medicine:', updated);
        

        if (!updated) {
          // Check if medicine exists or if it's insufficient stock
          const med = await Medicine.findById(it.medicineId).session(session).select('name quantity');
          if (!med) {
            throw new Error(`Medicine with ID ${it.medicineId} not found`);
          }
          const name = med.name || 'Unknown';
          const left = med.quantity ?? 0;
          throw new Error(`Insufficient stock for ${name}. Available: ${left}, requested: ${qty}`);
        }
      }

      // 2) Create the sale in the same txn
      const [saleDoc] = await Sale.create([{ items, totalPrice, cashierId }], { session });
      createdSale = saleDoc._id;
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
    // Fallback for non-transaction environments (e.g., local single node)
    const msg = String(err && err.message || '');
    const looksLikeTxnUnsupported = /Transaction|replica set|not a replica set/i.test(msg);

    if (looksLikeTxnUnsupported) {
      try {
        // Apply guarded decrements one by one; roll back on failure
        const succeeded = [];
        for (const it of items) {
          const qty = Number(it.quantity || 0);
          if (!it.medicineId || qty <= 0) {
            // Rollback any previous deductions
            for (const ok of succeeded) {
              await Medicine.updateOne({ _id: ok.medicineId }, { $inc: { quantity: ok.qty } });
            }
            return res.status(400).json({ error: 'Invalid item in sale payload' });
          }

          // Validate medicine exists before attempting to deduct
          const med = await Medicine.findById(it.medicineId).select('name quantity');
          if (!med) {
            // Rollback any previous deductions
            for (const ok of succeeded) {
              await Medicine.updateOne({ _id: ok.medicineId }, { $inc: { quantity: ok.qty } });
            }
            return res.status(404).json({ error: `Medicine with ID ${it.medicineId} not found` });
          }

          const upd = await Medicine.updateOne(
            { _id: it.medicineId, quantity: { $gte: qty } },
            { $inc: { quantity: -qty } }
          );
          if (upd.modifiedCount !== 1) {
            // Rollback any previous deductions
            for (const ok of succeeded) {
              await Medicine.updateOne({ _id: ok.medicineId }, { $inc: { quantity: ok.qty } });
            }
            const name = med?.name || 'Unknown';
            const left = med?.quantity ?? 0;
            return res.status(400).json({ error: `Insufficient stock for ${name}. Available: ${left}, requested: ${qty}` });
          }
          succeeded.push({ medicineId: it.medicineId, qty });
        }

        // Create sale - if this fails, rollback all stock deductions
        let sale;
        try {
          sale = await Sale.create({ items, totalPrice, cashierId });
        } catch (saleError) {
          // Critical: Rollback all stock deductions if sale creation fails
          for (const ok of succeeded) {
            await Medicine.updateOne({ _id: ok.medicineId }, { $inc: { quantity: ok.qty } });
          }
          throw saleError;
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

    const total = sales.reduce((sum, s) => sum + Number(s.totalPrice || 0), 0);
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

  const total = sales.reduce((sum, s) => sum + Number(s.totalPrice || 0), 0);
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
            // Atomically restore stock using $inc
            await Medicine.findByIdAndUpdate(
              medicineId,
              { $inc: { quantity: qty } },
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
              // Handle both ObjectId and populated object
              const medicineId = item.medicineId._id || item.medicineId;
              await Medicine.findByIdAndUpdate(
                medicineId,
                { $inc: { quantity: qty } }
              );
            }
          }
        }

        const total = sales.reduce((sum, s) => sum + Number(s.totalPrice || 0), 0);
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
