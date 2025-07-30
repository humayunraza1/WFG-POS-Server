const express = require('express');
const router = express.Router();
const { default: mongoose } = require('mongoose');
const hasAccess = require('../middleware/hasAccess');
const Account = require('../models/Account');
const Business = require('../models/Business');
const authenticate = require('../middleware/authenticate');

router.use(authenticate)

// -----------------------------
// BUSINESS PREFERENCES ROUTES
// -----------------------------

// ✅ GET current business preferences
router.get('/business', async (req, res) => {
  try {
    const {userId} = req.user;
    const business = await Account.findById(userId).select('businessRef').populate('businessRef','preferences');
    if (!business) return res.status(404).json({ message: 'Business not found' });

    res.json(business.businessRef.preferences);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ✅ UPDATE a specific business preference by key
router.put('/business', hasAccess('isAdmin'), async (req, res) => {
  try {
    const {access,userId} = req.user;
    const { key, value } = req.body;
    if (!key) return res.status(400).json({ message: 'Preference key is required' });

    const businessId = await Account.findById(userId).select('businessRef').populate('businessRef','_id');
    const business = await Business.findById(businessId.businessRef._id)
    if (!business) return res.status(404).json({ message: 'Business not found' });

    if (!(key in business.preferences)) {
      return res.status(400).json({ message: `Preference '${key}' does not exist` });
    }

    business.preferences[key] = value;
    await business.save();
    res.json({ message: `Preference '${key}' updated`, preferences: business.preferences });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


// -----------------------------
// ACCOUNT PREFERENCES ROUTES
// -----------------------------

// ✅ GET current account preferences
router.get('/account' , async (req, res) => {
  try {
    const {userId} = req.user;
    const account = await Account.findById(userId).select('preferences');
    if (!account) return res.status(404).json({ message: 'Account not found' });

    res.json(account.preferences);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ✅ UPDATE a specific account preference by key
router.put('/account', async (req, res) => {
  try {
    const {userId} = req.user;
    const { key, value } = req.body;
    if (!key) return res.status(400).json({ message: 'Preference key is required' });

    const account = await Account.findById(userId);
    if (!account) return res.status(404).json({ message: 'Account not found' });

    if (!(key in account.preferences)) {
      return res.status(400).json({ message: `Preference '${key}' does not exist` });
    }

    account.preferences[key] = value;
    await account.save();
    res.json({ message: `Preference '${key}' updated`, preferences: account.preferences });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;