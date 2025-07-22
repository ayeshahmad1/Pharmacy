const mongoose = require('mongoose');

const saleSchema = new mongoose.Schema({
  items: [{
    medicineId: { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine' },
    quantity: Number,
    price: Number
  }],
  totalPrice: Number,
  cashierId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Sale', saleSchema);