const express = require('express');
const router = express.Router();
const {
  createPurchase,
  getAllPurchases,
  updatePurchase,
  deletePurchase
} = require('../controllers/purchaseController');
// const protect = require('../middleware/authMiddleware');

router.post('/', /*protect,*/ createPurchase);
router.get('/', /*protect,*/ getAllPurchases);
router.put('/:id', /*protect,*/ updatePurchase);
router.delete('/:id', /*protect,*/ deletePurchase);

module.exports = router;
