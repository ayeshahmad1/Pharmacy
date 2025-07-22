const Sale = require('../models/Sale');
const Medicine = require('../models/Medicine');

exports.getSales = async (req, res) => {
  try {
    const sales = await Sale.find()
  .populate('cashierId', 'name')
  .populate('items.medicineId', 'name');
    res.json(sales);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

exports.createSale = async (req, res) => {
  try {
    const { items, totalPrice } = req.body;

    // Decrease stock for each medicine sold
    for (const item of items) {
      await Medicine.findByIdAndUpdate(item.medicineId, {
        $inc: { quantity: -item.quantity }
      });
    }

    const sale = await Sale.create({
      items,
      totalPrice,
      cashierId: req.user ? req.user._id : null
    });

    res.status(201).json(sale);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
