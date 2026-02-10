// models/Medicine.js
const mongoose = require('mongoose');
const medicineSchema = new mongoose.Schema({
  name: String,
  type: String,
  batchNo: String,
  expiryDate: Date,
  quantity: Number,
  price: Number,
  supplier: String,
  isActive: { type: Boolean, default: true }   // fine to keep
}, { timestamps: true });
module.exports = mongoose.model('Medicine', medicineSchema);
