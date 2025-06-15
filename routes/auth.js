const express = require('express');
const jwt = require('jsonwebtoken');
const Account = require('../models/Account');
const authenticate = require('../middleware/authenticate');

const router = express.Router();

// JWT Secret keys (in production, use environment variables)
const JWT_SECRET = process.env.JWT_SECRET 
const REFRESH_SECRET = process.env.REFRESH_SECRET
// Token expiration times
const ACCESS_TOKEN_EXPIRY = '15m'; // 15 minutes
const REFRESH_TOKEN_EXPIRY = '7d'; // 7 days

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

// POST /create - Create new user account
router.post('/create', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // Validation
    if (!username || !password) {
      return res.status(400).json({ 
        message: 'Username and password are required' 
      });
    }
    
    if (username.length < 3) {
      return res.status(400).json({ 
        message: 'Username must be at least 3 characters long' 
      });
    }
    
    // Check if username already exists
    const existingAccount = await Account.findOne({ username });
    if (existingAccount) {
      return res.status(409).json({ 
        message: 'Username already exists' 
      });
    }
    
    // Create new account
    const account = new Account({ username, password });
    await account.save();
    
    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(account._id);
    
    // Store refresh token in database
    account.refreshTokens.push({ token: refreshToken });
    await account.save();
    
    // Set cookies
    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 15 * 60 * 1000 // 15 minutes
    });
    
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });
    
    res.status(201).json({ 
      message: 'Account created successfully',
      user: { 
        id: account._id, 
        username: account.username 
      }
    });
    
  } catch (error) {
    console.error('Account creation error:', error);
    res.status(500).json({ message: 'Server error during account creation' });
  }
});

// POST /login - Login user
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // Validation
    if (!username || !password) {
      return res.status(400).json({ 
        message: 'Username and password are required' 
      });
    }
    
    // Find account
    const account = await Account.findOne({ username });
    if (!account) {
      return res.status(401).json({ 
        message: 'Invalid username or password' 
      });
    }
    
    // Check password
    const isPasswordValid = await account.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({ 
        message: 'Invalid username or password' 
      });
    }
    
    // Clean expired tokens
    await account.cleanExpiredTokens();
    
    // Generate new tokens
    const { accessToken, refreshToken } = generateTokens(account._id);
    
    // Store refresh token in database
    account.refreshTokens.push({ token: refreshToken });
    await account.save();
    
    // Set cookies
    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 15 * 60 * 1000 // 15 minutes
    });
    
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });
    
    res.json({ 
      message: 'Login successful',
      user: { 
        id: account._id, 
        username: account.username 
      }
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error during login' });
  }
});

// GET /me - Check authentication status and refresh token if needed
router.get('/me', async (req, res) => {
  try {
    const { accessToken, refreshToken } = req.cookies;
    
    // If no tokens, user is not authenticated
    if (!accessToken && !refreshToken) {
      return res.status(401).json({ message: 'Not authenticated' });
    }
    
    // Try to verify access token first
    if (accessToken) {
      try {
        const decoded = jwt.verify(accessToken, JWT_SECRET);
        const account = await Account.findById(decoded.userId).select('-password -refreshTokens');
        
        if (account) {
          return res.json({ 
            user: { 
              id: account._id, 
              username: account.username 
            }
          });
        }
      } catch (error) {
        // Access token is invalid/expired, try refresh token
        console.log('Access token expired, trying refresh token');
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
        const tokenExists = account.refreshTokens.some(tokenObj => tokenObj.token === refreshToken);
        if (!tokenExists) {
          return res.status(401).json({ message: 'Invalid refresh token' });
        }
        
        // Generate new access token
        const { accessToken: newAccessToken } = generateTokens(account._id);
        
        // Set new access token cookie
        res.cookie('accessToken', newAccessToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          maxAge: 15 * 60 * 1000 // 15 minutes
        });
        
        return res.json({ 
          message: 'Token refreshed',
          user: { 
            id: account._id, 
            username: account.username 
          }
        });
        
      } catch (error) {
        console.error('Refresh token error:', error);
        // Clear invalid cookies
        res.clearCookie('accessToken');
        res.clearCookie('refreshToken');
        return res.status(401).json({ message: 'Invalid refresh token' });
      }
    }
    
    return res.status(401).json({ message: 'Not authenticated' });
    
  } catch (error) {
    console.error('Authentication check error:', error);
    res.status(500).json({ message: 'Server error during authentication check' });
  }
});

// POST /logout - Logout user
router.post('/logout', authenticate, async (req, res) => {
  try {
    const { refreshToken } = req.cookies;
    
    if (refreshToken) {
      // Remove refresh token from database
      const account = await Account.findById(req.user.userId);
      if (account) {
        await account.removeRefreshToken(refreshToken);
      }
    }
    
    // Clear cookies
    res.clearCookie('accessToken');
    res.clearCookie('refreshToken');
    
    res.json({ message: 'Logout successful' });
    
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ message: 'Server error during logout' });
  }
});

module.exports = router;