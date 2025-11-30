const express = require('express');
const { upsertDaily, getByDate, getRange,getMonthlyAttendance } = require('../controllers/attendanceController');

const protect = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);

// routes/attendanceRoutes.js
router.post('/daily', upsertDaily);
router.get('/daily/:date', getByDate);
router.get('/range', getRange);
router.get('/monthly', getMonthlyAttendance);  

module.exports = router;