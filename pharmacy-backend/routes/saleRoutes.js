// routes/saleRoutes.js
const express = require('express');
const router = express.Router();
const { createSale, getSales, getSalesByDate, closeDayByDate } = require('../controllers/saleController');
const { createReturn, getSaleByBillNumber } = require('../controllers/returnsController');

// List all sales
router.get('/', getSales);
// Lookup sale by printed bill number (for returns)
router.get('/bill/:billNumber', getSaleByBillNumber);
// Create normal sale
router.post('/', createSale);
// Create return (increment stock, negative total)
router.post('/return', createReturn);
// End-of-day helpers
router.get('/by-date', getSalesByDate);
router.post('/close-day', closeDayByDate);

module.exports = router;
