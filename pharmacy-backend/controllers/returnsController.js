const mongoose = require('mongoose');
const Sale = require('../models/Sale');
const Medicine = require('../models/Medicine');

function normalizeBillNumber(s) {
  return String(s || '').trim();
}

async function getReturnedQtyByMedicine(sourceSaleId, session) {
  const q = Sale.find({ isReturn: true, sourceSaleId }).select('items').lean();
  if (session) {
    q.session(session);
  }
  const returns = await q;
  const map = {};
  for (const r of returns) {
    for (const line of r.items || []) {
      const id = String(line.medicineId);
      map[id] = (map[id] || 0) + Number(line.quantity || 0);
    }
  }
  return map;
}

// GET /api/sales/bill/:billNumber
const getSaleByBillNumber = async (req, res) => {
  try {
    const billNumber = normalizeBillNumber(req.params.billNumber);
    if (!billNumber) {
      return res.status(400).json({ error: 'Bill number is required' });
    }
    const sale = await Sale.findOne({
      billNumber,
      isReturn: { $ne: true }
    })
      .populate('cashierId', 'name')
      .populate('items.medicineId', 'name');

    if (!sale) {
      return res.status(404).json({ error: 'No sale found for this bill number' });
    }

    const returnedByMed = await getReturnedQtyByMedicine(sale._id);

    const lines = sale.items.map((it) => {
      const mid = String(it.medicineId._id || it.medicineId);
      const sold = Number(it.quantity || 0);
      const alreadyReturned = returnedByMed[mid] || 0;
      return {
        medicineId: mid,
        name: (it.medicineId && it.medicineId.name) || 'Unknown',
        soldQty: sold,
        returnedQty: alreadyReturned,
        returnableQty: Math.max(0, sold - alreadyReturned),
        unitPrice: it.discountedPrice,
        originalUnitPrice: it.originalPrice
      };
    });

    return res.json({
      billNumber: sale.billNumber,
      saleId: sale._id,
      createdAt: sale.createdAt,
      netTotal: sale.netTotal ?? sale.totalPrice,
      cashierName: sale.cashierId?.name,
      lines
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to load bill' });
  }
};

function computeReturnTotals(processedItems) {
  let originalSum = 0;
  let netSum = 0;
  for (const row of processedItems) {
    const q = Number(row.quantity || 0);
    originalSum += Number(row.originalPrice || 0) * q;
    netSum += Number(row.discountedPrice || 0) * q;
  }
  originalSum = Math.round(originalSum * 100) / 100;
  netSum = Math.round(netSum * 100) / 100;
  const discountSum = Math.round((originalSum - netSum) * 100) / 100;
  return { originalSum, netSum, discountSum };
}

async function planReturnFromBill(billNumber, items, session) {
  const findSale = Sale.findOne({ billNumber, isReturn: { $ne: true } });
  if (session) {
    findSale.session(session);
  }
  const sale = await findSale;
  if (!sale) {
    throw new Error('Bill not found');
  }

  const returnedMap = await getReturnedQtyByMedicine(sale._id, session);

  const saleLineByMed = {};
  for (const it of sale.items) {
    saleLineByMed[String(it.medicineId)] = it;
  }

  const processedItems = [];

  for (const reqItem of items) {
    const mid = String(reqItem.medicineId);
    const qty = Number(reqItem.quantity || 0);
    if (!mongoose.Types.ObjectId.isValid(mid)) {
      throw new Error(`Invalid medicineId: ${mid}`);
    }
    if (qty <= 0 || !Number.isInteger(qty)) {
      throw new Error('Each item must have a positive integer quantity');
    }
    const line = saleLineByMed[mid];
    if (!line) {
      throw new Error('Medicine was not on this bill');
    }
    const sold = Number(line.quantity || 0);
    const already = returnedMap[mid] || 0;
    const returnable = Math.max(0, sold - already);
    if (qty > returnable) {
      throw new Error(
        `Return qty ${qty} exceeds returnable ${returnable} for this bill line`
      );
    }
    processedItems.push({
      medicineId: mid,
      quantity: qty,
      originalPrice: line.originalPrice,
      discountedPrice: line.discountedPrice
    });
    returnedMap[mid] = already + qty;
  }

  const totals = computeReturnTotals(processedItems);
  return {
    processedItems,
    sourceSaleId: sale._id,
    sourceBillNumber: sale.billNumber,
    ...totals
  };
}

async function planManualReturn(items, session) {
  const processedItems = [];
  for (const reqItem of items) {
    const mid = String(reqItem.medicineId);
    const qty = Number(reqItem.quantity || 0);
    const unitPrice = Number(reqItem.unitPrice);
    if (!mongoose.Types.ObjectId.isValid(mid)) {
      throw new Error(`Invalid medicineId: ${mid}`);
    }
    if (qty <= 0 || !Number.isInteger(qty)) {
      throw new Error('Each item must have a positive integer quantity');
    }
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
      throw new Error('Manual returns require a positive unitPrice on each line');
    }
    const medQuery = Medicine.findById(mid).select('name');
    if (session) {
      medQuery.session(session);
    }
    const med = await medQuery;
    if (!med) {
      throw new Error(`Medicine not found: ${mid}`);
    }
    const up = Math.round(unitPrice * 100) / 100;
    processedItems.push({
      medicineId: mid,
      quantity: qty,
      originalPrice: up,
      discountedPrice: up
    });
  }
  const totals = computeReturnTotals(processedItems);
  return {
    processedItems,
    sourceSaleId: undefined,
    sourceBillNumber: undefined,
    ...totals
  };
}

async function persistReturn({
  processedItems,
  originalSum,
  netSum,
  discountSum,
  cashierId,
  sourceSaleId,
  sourceBillNumber,
  isManualReturn,
  session
}) {
  const incOpts = session ? { session } : {};
  const succeededNoSession = [];

  try {
    for (const row of processedItems) {
      const qty = Number(row.quantity || 0);
      await Medicine.updateOne(
        { _id: row.medicineId },
        { $inc: { quantity: qty } },
        incOpts
      );
      if (!session) {
        succeededNoSession.push({ medicineId: row.medicineId, qty });
      }
    }

    const doc = {
      items: processedItems.map((r) => ({
        medicineId: r.medicineId,
        quantity: r.quantity,
        originalPrice: r.originalPrice,
        discountedPrice: r.discountedPrice
      })),
      originalTotal: -originalSum,
      totalDiscount: -discountSum,
      netTotal: -netSum,
      totalPrice: -netSum,
      cashierId,
      isReturn: true,
      isManualReturn: !!isManualReturn
    };
    if (sourceSaleId) {
      doc.sourceSaleId = sourceSaleId;
    }
    if (sourceBillNumber) {
      doc.sourceBillNumber = sourceBillNumber;
    }

    if (session) {
      const [saleDoc] = await Sale.create([doc], { session });
      return saleDoc._id;
    }
    const sale = await Sale.create(doc);
    return sale._id;
  } catch (err) {
    if (!session && succeededNoSession.length) {
      for (const ok of succeededNoSession) {
        await Medicine.updateOne({ _id: ok.medicineId }, { $inc: { quantity: -ok.qty } });
      }
    }
    throw err;
  }
}

async function populateReturn(id) {
  return Sale.findById(id)
    .populate({
      path: 'cashierId',
      select: 'name',
      model: 'User'
    })
    .populate('items.medicineId', 'name');
}

// POST /api/sales/return
// With billNumber: items [{ medicineId, quantity }] — pricing from stored bill.
// Without billNumber: manual items [{ medicineId, quantity, unitPrice }].
const createReturn = async (req, res) => {
  const { items, cashierId, billNumber: billNumberRaw } = req.body;

  if (!cashierId) {
    return res.status(400).json({ error: 'cashierId is required' });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'items are required' });
  }

  const billNumber = normalizeBillNumber(billNumberRaw);

  const session = await mongoose.startSession();
  try {
    let createdSaleId;

    await session.withTransaction(async () => {
      const planned = billNumber
        ? await planReturnFromBill(billNumber, items, session)
        : await planManualReturn(items, session);
      createdSaleId = await persistReturn({
        processedItems: planned.processedItems,
        originalSum: planned.originalSum,
        netSum: planned.netSum,
        discountSum: planned.discountSum,
        cashierId,
        sourceSaleId: planned.sourceSaleId,
        sourceBillNumber: planned.sourceBillNumber,
        isManualReturn: !billNumber,
        session
      });
    });

    const populated = await populateReturn(createdSaleId);
    return res.status(201).json(populated);
  } catch (err) {
    const msg = String((err && err.message) || '');
    const looksLikeTxnUnsupported = /Transaction|replica set|not a replica set/i.test(msg);

    if (looksLikeTxnUnsupported) {
      try {
        const planned = billNumber
          ? await planReturnFromBill(billNumber, items, null)
          : await planManualReturn(items, null);

        // Single path: persistReturn updates stock + creates sale (no duplicate $inc)
        const saleId = await persistReturn({
          processedItems: planned.processedItems,
          originalSum: planned.originalSum,
          netSum: planned.netSum,
          discountSum: planned.discountSum,
          cashierId,
          sourceSaleId: planned.sourceSaleId,
          sourceBillNumber: planned.sourceBillNumber,
          isManualReturn: !billNumber,
          session: null
        });

        const populated = await populateReturn(saleId);
        return res.status(201).json(populated);
      } catch (e2) {
        const m = String((e2 && e2.message) || '');
        if (/Bill not found|not on this bill|exceeds returnable|Manual returns require|Invalid medicineId|positive integer|Medicine not found/i.test(m)) {
          return res.status(400).json({ error: m || 'Invalid return' });
        }
        return res.status(500).json({ error: m || 'Failed to create return' });
      }
    }

    if (/Bill not found|not on this bill|exceeds returnable|Manual returns require|Invalid medicineId|positive integer|Medicine not found/i.test(msg)) {
      return res.status(400).json({ error: msg });
    }

    return res.status(500).json({ error: msg || 'Failed to create return' });
  } finally {
    session.endSession();
  }
};

module.exports = {
  createReturn,
  getSaleByBillNumber
};
