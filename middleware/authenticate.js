const jwt = require('jsonwebtoken');
const Account = require('../models/Account');
const { expandAccess } = require('../utils/accessControl');
const Login = require('../models/Login');

const JWT_SECRET = process.env.JWT_SECRET 
const REFRESH_SECRET = process.env.REFRESH_SECRET

const authenticate = async (req, res, next) => {
  try {
    const { accessToken, refreshToken } = req.cookies;

    // If no tokens, user is not authenticated
    if (!accessToken && !refreshToken) {
      return res.status(401).json({ message: 'Access denied. No token provided.' });
    }

    // ✅ Try verifying accessToken first
    if (accessToken) {
      try {
        const decoded = jwt.verify(accessToken, JWT_SECRET);
        const account = await Account.findById(decoded.userId).select('-password');
        if (account) {
          req.user = {
            userId: account._id,
            username: account.username,
            access: expandAccess(account.access)
          };
          return next();
        }
      } catch (error) {
        console.error('access token expired, getting new token');
      }
    }

    // ❗ If access token failed or didn’t exist, try refresh token
    if (refreshToken) {
      try {
        const decoded = jwt.verify(refreshToken, REFRESH_SECRET);
        const account = await Account.findById(decoded.userId);

        if (!account) {
          return res.status(401).json({ message: 'Account not found' });
        }

        const tokenExists = await Login.findOne({
          accountRef: account._id,
          refreshToken
        });

        if (!tokenExists) {
          return res.status(401).json({ message: 'Invalid refresh token' });
        }

        // 🔁 Issue new access token
        const newAccessToken = jwt.sign(
          { userId: account._id },
          JWT_SECRET,
          { expiresIn: '15m' }
        );

        res.cookie('accessToken', newAccessToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          maxAge: 15 * 60 * 1000
        });

        req.user = {
          userId: account._id,
          username: account.username,
          access: expandAccess(account.access)
        };

        return next();
      } catch (error) {
        console.error('Refresh token error:', error);
        res.clearCookie('accessToken');
        res.clearCookie('refreshToken');
        return res.status(401).json({ message: 'Invalid refresh token' });
      }
    }

    // ❌ If both tokens fail
    return res.status(401).json({ message: 'Access denied. Invalid token.' });

  } catch (error) {
    console.error('Authentication middleware error:', error);
    res.status(500).json({ message: 'Server error during authentication' });
  }
};


module.exports = authenticate;