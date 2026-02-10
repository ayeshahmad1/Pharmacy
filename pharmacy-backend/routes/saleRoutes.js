// routes/saleRoutes.js
const express = require('express');
const router = express.Router();
const { createSale, getSales, getSalesByDate, closeDayByDate } = require('../controllers/saleController');

router.get('/', getSales);
router.post('/', createSale);
router.get('/by-date', getSalesByDate);
router.post('/close-day', closeDayByDate);

module.exports = router;
