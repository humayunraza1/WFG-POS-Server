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
    
    // Try to verify access token first
    if (accessToken) {
      try {
        const decoded = jwt.verify(accessToken, JWT_SECRET);
        const account = await Account.findById(decoded.userId).select('-password');
    if (account) {
      try{
          req.user = {
            userId: account._id,
            username: account.username,
            access: expandAccess(account.access)
          };
          return next();
      } catch (error) {
        // Access token is invalid/expired, try refresh token
        console.error('Access token verification error:', error);
        console.log('Access token expired, trying refresh token');
      }
    }
   } catch (error) {
        console.error('Access token verification error:', error);
        // Access token is invalid/expired, try refresh token
      } 
    }    
    // If access token is invalid/expired, try refresh token
    if (refreshToken) {
      try {
        const decoded = jwt.verify(refreshToken, REFRESH_SECRET);
        const account = await Account.findById(decoded.userId);
        
        if (!account) {
          return res.status(401).json({ message: 'Account not found' });
        }
        
        // Check if refresh token exists in database
        const tokenExists = await Login.findOne({ accountRef: account._id, refreshToken });
        if (!tokenExists) {
          return res.status(401).json({ message: 'Invalid refresh token' });
        }
        
        // Generate new access token
        const newAccessToken = jwt.sign(
          { userId: account._id }, 
          JWT_SECRET, 
          { expiresIn: '15m' }
        );
        
        // Set new access token cookie
        res.cookie('accessToken', newAccessToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          maxAge: 15 * 60 * 1000 // 15 minutes
        });
        
        req.user = { userId: account._id, username: account.username };
        return next();
        
      } catch (error) {
        console.error('Refresh token error:', error);
        // Clear invalid cookies
        res.clearCookie('accessToken');
        res.clearCookie('refreshToken');
        return res.status(401).json({ message: 'Invalid refresh token' });
      }
    }
    
    return res.status(401).json({ message: 'Access denied. Invalid token.' });
    
  } catch (error) {
    console.error('Authentication middleware error:', error);
    res.status(500).json({ message: 'Server error during authentication' });
  }
};

module.exports = authenticate;