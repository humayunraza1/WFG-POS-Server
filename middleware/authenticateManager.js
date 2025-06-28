const jwt = require('jsonwebtoken');
const Account = require('../models/Account');
const Employees = require('../models/Employees');
const { expandAccess } = require('../utils/accessControl');

const JWT_SECRET = process.env.JWT_SECRET 
const REFRESH_SECRET = process.env.REFRESH_SECRET

const authenticateManager = async (req, res, next) => {
  try {
    const { managerAccessToken, managerRefreshToken } = req.cookies;
    
    // If no tokens, user is not authenticated
    if (!managerAccessToken && !managerRefreshToken) {
      return res.status(401).json({ message: 'Access denied. No token provided.' });
    }
    
    // Try to verify access token first
    if (managerAccessToken) {
      try {
        const decoded = jwt.verify(managerAccessToken, JWT_SECRET);
        const account = await Account.findById(decoded.userId).select('-password -refreshTokens');
        const employee = await Employees.findOne({ accountRef: account._id });
        
    if (account) {
      try{
          req.user = {
            userId: account._id,
            role: employee.role,
            access: expandAccess(account.access)
          };

          console.log("User Access:", req.user.access);
          return next();
      } catch (error) {
        // Access token is invalid/expired, try refresh token
        console.log('Manager Access token expired, trying refresh token');
      }
    }
   } catch (error) {
        console.error('Access token verification error:', error);
        // Access token is invalid/expired, try refresh token
      } 
    }    
    // If access token is invalid/expired, try refresh token
    if (managerRefreshToken) {
      try {
        const decoded = jwt.verify(managerRefreshToken, REFRESH_SECRET);
        const account = await Account.findById(decoded.userId);
            const employee = await Employees.findOne({ accountRef: account._id });
        
        if (!account) {
          return res.status(401).json({ message: 'Account not found' });
        }
        
        // Check if refresh token exists in database
        const tokenExists = account.refreshTokens.some(tokenObj => tokenObj.token === managerRefreshToken);
        if (!tokenExists) {
          return res.status(401).json({ message: 'Invalid refresh token' });
        }
        
        // Generate new access token
        const newAccessToken = jwt.sign(
          { userId: account._id,role: employee.role, access: expandAccess(account.access) }, 
          JWT_SECRET, 
          { expiresIn: '15m' }
        );
        
        // Set new access token cookie
        res.cookie('managerAccessToken', newAccessToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          maxAge: 15 * 60 * 1000 // 15 minutes
        });
        
        req.user = { userId: account._id, role: employee.role, access: expandAccess(account.access) };
        return next();
        
      } catch (error) {
        console.error('Refresh token error:', error);
        // Clear invalid cookies
        res.clearCookie('managerAccessToken');
        res.clearCookie('managerRefreshToken');
        return res.status(401).json({ message: 'Invalid refresh token' });
      }
    }
    
    return res.status(401).json({ message: 'Access denied. Invalid token.' });
    
  } catch (error) {
    console.error('Authentication middleware error:', error);
    res.status(500).json({ message: 'Server error during authentication' });
  }
};

module.exports = authenticateManager;