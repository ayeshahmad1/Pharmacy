const express = require('express');
const router = express.Router();
const protect = require('../middleware/authMiddleware');
const { createSale, getSales } = require('../controllers/saleController');

router.get('/', /*protect,*/ getSales);
router.post('/', /*protect, */ createSale);

module.exports = router;
