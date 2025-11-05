const express = require('express');
const { getAttendance, createAttendance } = require('../controllers/attendanceController');
const protect = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);

router.route('/')
  .get(getAttendance)
  .post(createAttendance);

module.exports = router;