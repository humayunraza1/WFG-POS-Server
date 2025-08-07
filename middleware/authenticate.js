const jwt = require('jsonwebtoken');
const Account = require('../models/Account');
const { expandAccess } = require('../utils/accessControl');
const { JWT_SECRET } = process.env;

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || '';
    const accessToken = authHeader && authHeader.startsWith('Bearer ')
      ? authHeader.split(' ')[1]
      : null;

    if (!accessToken) {
      return res.status(401).json({ message: 'Access denied. No token provided.' });
    }

    const decoded = jwt.verify(accessToken, JWT_SECRET);
    const account = await Account.findById(decoded.userId).select('-password');

    if (!account) {
      return res.status(401).json({ message: 'Invalid token' });
    }

    req.user = {
      userId: account._id,
      username: account.username,
      access: expandAccess(account.access),
    };

    next();
  } catch (err) {
    console.error('Authentication error:', err);
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};

module.exports = authenticate;
