const express = require('express');
const { upsertDaily, getByDate, getRange } = require('../controllers/attendanceController');

const protect = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);

// routes/attendanceRoutes.js
router.post('/daily', upsertDaily);
router.get('/daily/:date', getByDate);
router.get('/daily/range', getRange);

module.exports = router;