const express = require('express');
const router = express.Router();
const Expense = require('../models/Expense');
const {Register} = require('../models/Register');
const authenticate = require('../middleware/authenticate');

router.use(authenticate);
// Get all expenses
router.get('/', async (req, res) => {
  try {
    const expenses = await Expense.find();
    res.json(expenses);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

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

// Add new expense
router.post('/', async (req, res) => {
  const expense = new Expense({
    registerSession: req.body.registerSession,
    name: req.body.name,
    amount: req.body.amount
  });

  try {
    const newExpense = await expense.save();
    
    // Update register total expenses
    await Register.findOneAndUpdate(
      { isOpen: true },
      { $inc: { totalExpenses: req.body.amount } }
    );

    res.status(201).json(newExpense);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Update expense
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, amount } = req.body;
    
    // Get the old expense to calculate the difference
    const oldExpense = await Expense.findById(id);
    if (!oldExpense) {
      return res.status(404).json({ message: 'Expense not found' });
    }
    
    const amountDifference = amount - oldExpense.amount;
    
    // Update the expense
    const updatedExpense = await Expense.findByIdAndUpdate(
      id,
      { name, amount },
      { new: true }
    );
    
    // Update register total expenses with the difference
    await Register.findOneAndUpdate(
      { isOpen: true },
      { $inc: { totalExpenses: amountDifference } }
    );

    res.json(updatedExpense);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Delete expense
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get the expense to subtract its amount from register
    const expense = await Expense.findById(id);
    if (!expense) {
      return res.status(404).json({ message: 'Expense not found' });
    }
    
    // Delete the expense
    await Expense.findByIdAndDelete(id);
    
    // Update register total expenses by subtracting the deleted amount
    await Register.findOneAndUpdate(
      { isOpen: true },
      { $inc: { totalExpenses: -expense.amount } }
    );

    res.json({ message: 'Expense deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;