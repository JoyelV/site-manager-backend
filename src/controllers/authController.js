const User = require('../models/User');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// Generate Access Token (1h)
const generateAccessToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: '1h' });
};

// Generate Refresh Token (7 days)
const generateRefreshToken = () => {
  return crypto.randomBytes(64).toString('hex');
};

// Store refresh token in DB (optional: or in memory)
const refreshTokens = new Set(); // Use Redis in production

const signup = async (req, res) => {
  const { email, password } = req.body;
  try {
    let user = await User.findOne({ email });
    if (user) return res.status(400).json({ msg: 'User exists' });

    user = new User({ email, password });
    await user.save();

    const accessToken = generateAccessToken(user._id);
    const refreshToken = generateRefreshToken();
    refreshTokens.add(refreshToken);

    res.json({ accessToken, refreshToken });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

const login = async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user || !(await user.matchPassword(password))) {
      return res.status(401).json({ msg: 'Invalid credentials' });
    }

    const accessToken = generateAccessToken(user._id);
    const refreshToken = generateRefreshToken();

    // Store refresh token in httpOnly cookie
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // HTTPS only in prod
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    // Store user ID in DB or Redis for revocation
    await storeRefreshToken(user._id, refreshToken);

    res.json({ accessToken });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

// NEW: Refresh Token Endpoint
const refreshToken = async (req, res) => {
  const refreshToken = req.cookies.refreshToken;
  if (!refreshToken) return res.status(403).json({ msg: 'No token' });

  const userId = await verifyRefreshToken(refreshToken);
  if (!userId) return res.status(403).json({ msg: 'Invalid token' });

  const accessToken = generateAccessToken(userId);
  res.json({ accessToken });
};

module.exports = { signup, login, refreshToken };