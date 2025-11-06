const User = require('../models/User');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// ------------------------------------------------------------------
// Helper: Access token (1 h)
const generateAccessToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: '1h' });
};

// Helper: Refresh token (random 64‑byte hex)
const generateRefreshToken = () => crypto.randomBytes(64).toString('hex');

// ------------------------------------------------------------------
// Store a new refresh token for a user
const storeRefreshToken = async (userId, refreshToken) => {
  await User.findByIdAndUpdate(
    userId,
    { $push: { refreshTokens: { token: refreshToken } } },
    { new: true }
  );
};

// ------------------------------------------------------------------
// Verify a refresh token and return the userId (or null)
const verifyRefreshToken = async (refreshToken) => {
  const user = await User.findOne({ 'refreshTokens.token': refreshToken });
  if (!user) return null;

  // Clean up tokens older than 7 days
  await User.findByIdAndUpdate(user._id, {
    $pull: {
      refreshTokens: {
        createdAt: { $lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
    },
  });

  return user._id;
};

// ------------------------------------------------------------------
// SIGNUP
const signup = async (req, res) => {
  const { email, password } = req.body;
  try {
    if (await User.findOne({ email })) {
      return res.status(400).json({ msg: 'User exists' });
    }

    const user = new User({ email, password });
    await user.save();

    const accessToken = generateAccessToken(user._id);
    const refreshToken = generateRefreshToken();

    // httpOnly cookie (secure in prod)
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    await storeRefreshToken(user._id, refreshToken);

    res.json({ accessToken });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

// ------------------------------------------------------------------
// LOGIN
const login = async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user || !(await user.matchPassword(password))) {
      return res.status(401).json({ msg: 'Invalid credentials' });
    }

    const accessToken = generateAccessToken(user._id);
    const refreshToken = generateRefreshToken();

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    await storeRefreshToken(user._id, refreshToken);

    res.json({ accessToken });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

// ------------------------------------------------------------------
// REFRESH TOKEN ENDPOINT
const refreshToken = async (req, res) => {
  const refreshToken = req.cookies.refreshToken;
  if (!refreshToken) return res.status(403).json({ msg: 'No token' });

  const userId = await verifyRefreshToken(refreshToken);
  if (!userId) return res.status(403).json({ msg: 'Invalid token' });

  const accessToken = generateAccessToken(userId);
  res.json({ accessToken });
};

module.exports = { signup, login, refreshToken };