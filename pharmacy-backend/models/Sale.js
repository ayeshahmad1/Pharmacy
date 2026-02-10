// models/Sale.js
const mongoose = require('mongoose');
const { Schema } = mongoose;
const saleItemSchema = new Schema({
  medicineId: { type: Schema.Types.ObjectId, ref: 'Medicine', required: true },
  quantity:   { type: Number, required: true },
  price:      { type: Number, required: true }
}, { _id: false });
const saleSchema = new Schema({
  items:      { type: [saleItemSchema], required: true },
  totalPrice: { type: Number, required: true },
  cashierId:  { type: Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });
// If you previously forced a collection name, keep it as third argument.
// module.exports = mongoose.model('Sale', saleSchema, 'sales');
module.exports = mongoose.model('Sale', saleSchema);
