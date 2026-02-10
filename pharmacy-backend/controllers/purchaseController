const mongoose = require('mongoose');
const Purchase = require('../models/Purchase');
const Medicine = require('../models/Medicine');

exports.getAllPurchases = async (req, res) => {
  try {
    const purchases = await Purchase.find().populate('medicineId');
    res.json(purchases);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.createPurchase = async (req, res) => {
  const { medicineId, quantity, purchasePrice, supplier, discount } = req.body;

  // Validate input
  const purchaseQty = Number(quantity) || 0;
  if (!medicineId) {
    return res.status(400).json({ error: 'medicineId is required' });
  }
  if (purchaseQty <= 0) {
    return res.status(400).json({ error: 'Quantity must be greater than 0' });
  }

  const session = await mongoose.startSession();
  try {
    let createdPurchase;

    await session.withTransaction(async () => {
      // 1) Verify medicine exists
      const medicine = await Medicine.findById(medicineId).session(session);
      if (!medicine) {
        throw new Error('Medicine not found');
      }

      // 2) Atomically increment stock using $inc
      const updated = await Medicine.findByIdAndUpdate(
        medicineId,
        { $inc: { quantity: purchaseQty } },
        { new: true, session }
      );

      if (!updated) {
        throw new Error('Failed to update medicine stock');
      }

      // 3) Create purchase record in the same transaction
      const [purchaseDoc] = await Purchase.create([{
        medicineId,
        quantity: purchaseQty,
        purchasePrice,
        supplier,
        discount
      }], { session });

      createdPurchase = purchaseDoc;
    });

    // Populate for response
    const populated = await Purchase.findById(createdPurchase._id)
      .populate('medicineId', 'name quantity');
    
    return res.status(201).json(populated);
  } catch (err) {
    // Fallback for non-transaction environments
    const msg = String(err && err.message || '');
    const looksLikeTxnUnsupported = /Transaction|replica set|not a replica set/i.test(msg);

    if (looksLikeTxnUnsupported) {
      try {
        // Use atomic $inc operation for better concurrency
        const medicine = await Medicine.findById(medicineId);
        if (!medicine) {
          return res.status(404).json({ error: 'Medicine not found' });
        }

        const updated = await Medicine.findByIdAndUpdate(
          medicineId,
          { $inc: { quantity: purchaseQty } },
          { new: true }
        );

        if (!updated) {
          return res.status(500).json({ error: 'Failed to update medicine stock' });
        }

        const purchase = await Purchase.create({
          medicineId,
          quantity: purchaseQty,
          purchasePrice,
          supplier,
          discount
        });

        const populated = await Purchase.findById(purchase._id)
          .populate('medicineId', 'name quantity');
        
        return res.status(201).json(populated);
      } catch (e2) {
        return res.status(500).json({ error: e2.message });
      }
    }

    return res.status(400).json({ error: msg || 'Failed to create purchase' });
  } finally {
    session.endSession();
  }
};

exports.updatePurchase = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    let updatedPurchase;

    await session.withTransaction(async () => {
      // 1) Get the original purchase first
      const originalPurchase = await Purchase.findById(req.params.id).session(session);
      if (!originalPurchase) {
        throw new Error('Purchase not found');
      }

      const oldQuantity = Number(originalPurchase.quantity) || 0;
      const newQuantity = Number(req.body.quantity) || 0;
      const quantityChanged = oldQuantity !== newQuantity;

      // 2) Update medicine inventory atomically if quantity changed
      if (quantityChanged && originalPurchase.medicineId) {
        const diff = newQuantity - oldQuantity;
        
        // Use atomic $inc to update stock
        const updated = await Medicine.findByIdAndUpdate(
          originalPurchase.medicineId,
          { $inc: { quantity: diff } },
          { new: true, session }
        );

        if (!updated) {
          throw new Error('Medicine not found or failed to update stock');
        }

        // Prevent negative stock
        if (updated.quantity < 0) {
          // Rollback by adding back the diff
          await Medicine.findByIdAndUpdate(
            originalPurchase.medicineId,
            { $inc: { quantity: -diff } },
            { session }
          );
          throw new Error('Update would result in negative stock quantity');
        }
      }

      // 3) Update the purchase record in the same transaction
      const updated = await Purchase.findByIdAndUpdate(
        req.params.id,
        req.body,
        { new: true, runValidators: true, session }
      );

      if (!updated) {
        throw new Error('Failed to update purchase');
      }

      updatedPurchase = updated;
    });

    // Populate for response
    const populated = await Purchase.findById(updatedPurchase._id)
      .populate('medicineId', 'name quantity');

    return res.json(populated);
  } catch (err) {
    // Fallback for non-transaction environments
    const msg = String(err && err.message || '');
    const looksLikeTxnUnsupported = /Transaction|replica set|not a replica set/i.test(msg);

    if (looksLikeTxnUnsupported) {
      try {
        const originalPurchase = await Purchase.findById(req.params.id);
        if (!originalPurchase) {
          return res.status(404).json({ message: 'Purchase not found' });
        }

        const oldQuantity = Number(originalPurchase.quantity) || 0;
        const newQuantity = Number(req.body.quantity) || 0;
        const quantityChanged = oldQuantity !== newQuantity;

        // Update medicine inventory atomically if quantity changed
        if (quantityChanged && originalPurchase.medicineId) {
          const diff = newQuantity - oldQuantity;
          
          const medicine = await Medicine.findById(originalPurchase.medicineId);
          if (!medicine) {
            return res.status(404).json({ error: 'Medicine not found' });
          }

          // Check if update would result in negative stock
          const currentQty = Number(medicine.quantity) || 0;
          if (currentQty + diff < 0) {
            return res.status(400).json({ error: 'Update would result in negative stock quantity' });
          }

          // Use atomic $inc operation
          await Medicine.findByIdAndUpdate(
            originalPurchase.medicineId,
            { $inc: { quantity: diff } }
          );
        }

        const updated = await Purchase.findByIdAndUpdate(
          req.params.id,
          req.body,
          { new: true, runValidators: true }
        );

        if (!updated) {
          return res.status(404).json({ message: 'Purchase not found' });
        }

        const populated = await Purchase.findById(updated._id)
          .populate('medicineId', 'name quantity');

        return res.json(populated);
      } catch (e2) {
        return res.status(500).json({ error: e2.message });
      }
    }

    return res.status(400).json({ error: msg || 'Failed to update purchase' });
  } finally {
    session.endSession();
  }
};

exports.deletePurchase = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      // 1) Get the purchase first
      const purchase = await Purchase.findById(req.params.id).session(session);
      if (!purchase) {
        throw new Error('Purchase not found');
      }

      const purchaseQty = Number(purchase.quantity) || 0;

      // 2) Update medicine stock atomically if purchase quantity is valid
      if (purchaseQty > 0 && purchase.medicineId) {
        const medicine = await Medicine.findById(purchase.medicineId).session(session);
        if (!medicine) {
          throw new Error('Medicine not found');
        }

        const currentQty = Number(medicine.quantity) || 0;
        
        // Check if deletion would result in negative stock
        if (currentQty < purchaseQty) {
          throw new Error(`Cannot delete purchase: would result in negative stock. Current: ${currentQty}, to subtract: ${purchaseQty}`);
        }

        // Use atomic $inc operation to decrement stock
        const updated = await Medicine.findByIdAndUpdate(
          purchase.medicineId,
          { $inc: { quantity: -purchaseQty } },
          { new: true, session }
        );

        if (!updated) {
          throw new Error('Failed to update medicine stock');
        }
      }

      // 3) Delete the purchase in the same transaction
      await Purchase.findByIdAndDelete(req.params.id).session(session);
    });

    return res.json({ message: 'Purchase deleted and inventory updated' });
  } catch (err) {
    // Fallback for non-transaction environments
    const msg = String(err && err.message || '');
    const looksLikeTxnUnsupported = /Transaction|replica set|not a replica set/i.test(msg);

    if (looksLikeTxnUnsupported) {
      try {
        const purchase = await Purchase.findById(req.params.id);
        if (!purchase) {
          return res.status(404).json({ message: 'Purchase not found' });
        }

        const purchaseQty = Number(purchase.quantity) || 0;

        if (purchaseQty > 0 && purchase.medicineId) {
          const medicine = await Medicine.findById(purchase.medicineId);
          if (!medicine) {
            return res.status(404).json({ error: 'Medicine not found' });
          }

          const currentQty = Number(medicine.quantity) || 0;
          
          if (currentQty < purchaseQty) {
            return res.status(400).json({ 
              error: `Cannot delete purchase: would result in negative stock. Current: ${currentQty}, to subtract: ${purchaseQty}` 
            });
          }

          // Use atomic $inc operation
          await Medicine.findByIdAndUpdate(
            purchase.medicineId,
            { $inc: { quantity: -purchaseQty } }
          );
        }

        await purchase.deleteOne();
        return res.json({ message: 'Purchase deleted and inventory updated' });
      } catch (e2) {
        return res.status(500).json({ error: e2.message });
      }
    }

    return res.status(400).json({ error: msg || 'Failed to delete purchase' });
  } finally {
    session.endSession();
  }
};
