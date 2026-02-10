const Medicine = require('../models/Medicine');

exports.getMedicines = async (req, res) => {
  try {
    const meds = await Medicine.find();
    res.json(meds);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

exports.addMedicine = async (req, res) => {
  try {
    const newMed = await Medicine.create(req.body);
    res.status(201).json(newMed);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

exports.updateMedicine = async (req, res) => {
  try {
    // Prevent direct quantity updates - quantity should only be changed via purchases/sales
    // to maintain data integrity and prevent conflicts
    if (req.body.hasOwnProperty('quantity')) {
      return res.status(400).json({ 
        error: 'Cannot update quantity directly. Use purchase or sale endpoints to modify stock quantity.' 
      });
    }

    const med = await Medicine.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!med) {
      return res.status(404).json({ error: 'Medicine not found' });
    }
    res.json(med);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

exports.deleteMedicine = async (req, res) => {
  try {
    await Medicine.findByIdAndDelete(req.params.id);
    res.json({ message: 'Medicine deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
