const express = require('express');
const { getSalaryReport, setWps } = require('../controllers/salaryController');
const protect = require('../middleware/authMiddleware');

const router = express.Router();
router.use(protect);

router.get('/', getSalaryReport);
router.post('/wps', setWps);

module.exports = router;