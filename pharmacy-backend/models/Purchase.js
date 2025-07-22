const mongoose = require('mongoose');

const purchaseSchema = new mongoose.Schema({
  medicineId: { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine', required: true },
  quantity: { type: Number, required: true },
  purchasePrice: { type: Number, required: true },
  supplier: { type: String },
  discount: { type: Number, default: 0 },
  purchaseDate: { type: Date, default: Date.now }

});

module.exports = mongoose.model('Purchase', purchaseSchema);
