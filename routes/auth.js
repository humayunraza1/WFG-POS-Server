const express = require('express');
const jwt = require('jsonwebtoken');
const Account = require('../models/Account');
const Employee = require('../models/Employees');
const Login = require('../models/Login');
const authenticate = require('../middleware/authenticate');
const { expandAccess } = require('../utils/accessControl');

const router = express.Router();

// JWT Secret keys (in production, use environment variables)
const JWT_SECRET = process.env.JWT_SECRET 
const REFRESH_SECRET = process.env.REFRESH_SECRET
// Token expiration times
const ACCESS_TOKEN_EXPIRY = '12h'; // 1d minutes
const REFRESH_TOKEN_EXPIRY = '7d'; // 2 days

// Helper function to generate tokens
const generateTokens = (userId) => {
  const accessToken = jwt.sign(
    { userId }, 
    JWT_SECRET, 
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );
  
  const refreshToken = jwt.sign(
    { userId }, 
    REFRESH_SECRET, 
    { expiresIn: REFRESH_TOKEN_EXPIRY }
  );
  
  return { accessToken, refreshToken };
};

const isProd = process.env.NODE_ENV === 'production';
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: isProd,                      // only secure in production
  sameSite: isProd ? 'none' : 'lax',   // lax works locally without HTTPS
  path: '/',
};

// router.post('/register', async (req, res) => {
//   try {
//     const { username, password, access,businessRef} = req.body;
//     if (!username || !password) {
//       return res.status(400).json({ message: 'Username and password are required' });
//     }
//     const existingAccount = await Account.findOne({ username });
//     if (existingAccount) {
//       return res.status(409).json({ message: 'Username already exists' });
//     }
//     const account = new Account({ username, password, access,businessRef });
//     await account.save();
//     res.status(201).json({ message: 'Account created successfully' });
//   } catch (err) {
//     console.error('Registration error:', err);
//     res.status(500).json({ message: 'Server error during registration' });
//   }
// });

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password are required' });
    }

    const account = await Account.findOne({ username });
    if (!account || !(await account.comparePassword(password))) {
      return res.status(401).json({ message: 'Invalid username or password' });
    }

    if (!account.isActive) {
      return res.status(401).json({ message: 'Account disabled. Contact support' });
    }

    const { accessToken, refreshToken } = generateTokens(account._id);

    await Login.create({ accountRef: account._id, refreshToken });

    // Set refreshToken as HttpOnly cookie
    res.cookie('refreshToken', refreshToken, {
    ...COOKIE_OPTIONS,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    res.json({
      message: 'Login successful',
      accessToken,
      user: {
        id: account._id,
        username: account.username,
        access: expandAccess(account.access),
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Server error during login' });
  }
});


router.get('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.cookies;

    if (!refreshToken) {
      return res.status(401).json({ message: 'No refresh token found' });
    }

    const decoded = jwt.verify(refreshToken, REFRESH_SECRET);
    const account = await Account.findById(decoded.userId);
    if (!account) {
      return res.status(401).json({ message: 'Account not found' });
    }

    const tokenExists = await Login.findOne({ accountRef: account._id, refreshToken });
    if (!tokenExists) {
      return res.status(401).json({ message: 'Invalid refresh token' });
    }

    const { accessToken } = generateTokens(account._id);

    res.json({
      accessToken,
      user: {
        id: account._id,
        username: account.username,
        access: expandAccess(account.access),
      },
    });
  } catch (err) {
    console.error('Refresh token error:', err);
    res.clearCookie('refreshToken');
    res.status(401).json({ message: 'Refresh token invalid or expired' });
  }
});



// GET /me - Check authentication status and refresh token if needed
router.get('/me', authenticate, async (req, res) => {
  const { _id, username, access } = req.user;
  res.json({
    user: {
      id: _id,
      username,
      access: expandAccess(access)
    },
    ...(req.newAccessToken && { accessToken: req.newAccessToken })
  });
});

// POST /logout - Logout user
router.post('/logout', authenticate, async (req, res) => {
  try {
    const { refreshToken } = req.cookies;

    if (refreshToken) {
      await Login.findOneAndDelete({
        accountRef: req.user.userId,
        refreshToken,
      });
    }
res.clearCookie('refreshToken',COOKIE_OPTIONS);

    res.json({ message: 'Logout successful' });
  } catch (err) {
    res.status(500).json({ message: 'Server error during logout' });
  }
});


module.exports = router;