// models/Sale.js
const mongoose = require('mongoose');
const { Schema } = mongoose;
const saleItemSchema = new Schema({
  medicineId:      { type: Schema.Types.ObjectId, ref: 'Medicine', required: true },
  quantity:       { type: Number, required: true },
  originalPrice:  { type: Number, required: true }, // Price per unit from medicine collection
  discountedPrice: { type: Number, required: true }  // Price per unit after discount
}, { _id: false });
const saleSchema = new Schema({
  items:          { type: [saleItemSchema], required: true },
  originalTotal:  { type: Number }, // Sum of originalPrice * quantity for all items (new sales)
  totalDiscount:  { type: Number }, // Total discount amount (10% of originalTotal) (new sales)
  netTotal:       { type: Number }, // Final total after discount (originalTotal - totalDiscount) (new sales)
  totalPrice:      { type: Number }, // Legacy field for backward compatibility (old sales and returns)
  billNumber:     { type: String, unique: true, sparse: true }, // Printed bill ID (sales only)
  // When isReturn: link back to original sale / bill for auditing and partial returns
  sourceSaleId:   { type: Schema.Types.ObjectId, ref: 'Sale', sparse: true },
  sourceBillNumber: { type: String, sparse: true },
  isManualReturn: { type: Boolean, default: false }, // return without original bill (staff-entered price)
  cashierId:      { type: Schema.Types.ObjectId, ref: 'User', required: true },
  isReturn:       { type: Boolean, default: false }, // true for return transactions
  idempotencyKey: { type: String, unique: true, sparse: true } // For preventing duplicate sales
}, { timestamps: true });

// If you previously forced a collection name, keep it as third argument.
// module.exports = mongoose.model('Sale', saleSchema, 'sales');
module.exports = mongoose.model('Sale', saleSchema);
