const express = require('express');
const router = express.Router();
const protect = require('../middleware/authMiddleware');
const {
  getMedicines,
  addMedicine,
  updateMedicine,
  deleteMedicine
} = require('../controllers/medicineController');

router.get('/', /*protect,*/ getMedicines);
router.post('/', /*protect,*/ addMedicine);
router.put('/:id', /*protect,*/ updateMedicine);
router.delete('/:id', /*protect,*/ deleteMedicine);

module.exports = router;