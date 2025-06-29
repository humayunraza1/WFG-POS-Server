const express = require('express');
const router = express.Router();
const Expense = require('../models/Expense');
const Register = require('../models/Register');
const updateRegister = require('../utils/updateRegister');
const authenticate = require('../middleware/authenticate');

router.use(authenticate);
// Get expenses by session ID
router.get('/session/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const expenses = await Expense.find({ registerSession: sessionId });
    
    // If no expenses found, return empty array instead of 404
    res.json(expenses);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;