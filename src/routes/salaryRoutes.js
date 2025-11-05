const express = require('express');
const { getSalaryReport } = require('../controllers/salaryController');
const protect = require('../middleware/authMiddleware');

const router = express.Router();
router.use(protect);

router.get('/', getSalaryReport);

module.exports = router;