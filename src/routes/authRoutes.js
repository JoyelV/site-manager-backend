const express = require('express');
const { signup, login,refreshToken } = require('../controllers/authController');
const router = express.Router();

router.post('/signup', signup);
router.post('/login', login);
router.post('/refresh', refreshToken);

module.exports = router;