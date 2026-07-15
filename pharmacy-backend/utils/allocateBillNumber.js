const BillSequence = require('../models/BillSequence');

function utcDateKey() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Next bill number for today (UTC date), e.g. B-2026-04-03-00001.
 * Pass mongoose session when inside a transaction.
 */
async function allocateBillNumber(session) {
  const key = utcDateKey();
  const q = BillSequence.findOneAndUpdate(
    { _id: key },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  if (session) {
    q.session(session);
  }
  const doc = await q;
  const n = String(doc.seq).padStart(5, '0');
  return `B-${key}-${n}`;
}

module.exports = { allocateBillNumber };
