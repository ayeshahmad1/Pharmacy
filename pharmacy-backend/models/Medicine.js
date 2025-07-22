const mongoose = require('mongoose');

const medicineSchema = new mongoose.Schema({
  name: String,
  type: String,
  batchNo: String,
  expiryDate: Date,
  quantity: Number,
  price: Number,
  supplier: String
});

module.exports = mongoose.model('Medicine', medicineSchema);