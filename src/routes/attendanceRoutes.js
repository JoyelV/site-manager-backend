const express = require('express');
const { getAttendance, createAttendance,getAttendanceByDate,getAttendanceRange } = require('../controllers/attendanceController');
const protect = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);

router.route('/')
  .get(getAttendance)
  .post(createAttendance);

// GET /api/attendance/date/:date
router.get('/date/:date', getAttendanceByDate);

// GET /api/attendance/range
router.get('/range', getAttendanceRange);

module.exports = router;