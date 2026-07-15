const mongoose = require('mongoose');
const { Schema } = mongoose;

// One document per calendar day (UTC date key YYYY-MM-DD); atomic seq for bill numbers.
const billSequenceSchema = new Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 }
}, { collection: 'billsequences' });

module.exports = mongoose.model('BillSequence', billSequenceSchema);
