const express = require('express');
const router = express.Router();
const Expense = require('../models/Expense');
const Register = require('../models/Register');
const updateRegister = require('../utils/updateRegister');
const authenticate = require('../middleware/authenticate');
const hasAccess = require('../middleware/hasAccess');
const { default: mongoose } = require('mongoose');

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

// Add new expense
router.post('/',hasAccess("canAddExpense"), async (req, res) => {
    const session = await mongoose.startSession();

  if(!req.body.registerSession){
    return res.status(400).json("Please select an active register session")
  }
    session.startTransaction();

  const expense = new Expense({
    registerSession: req.body.registerSession,
    name: req.body.name,
    amount: req.body.amount
  });

  try {
    const newExpense = await expense.save({session});
      // Update register total expenses
    await Register.findOneAndUpdate(
      { isOpen: true, sessionId: req.body.registerSession },
      { $push: { expenses: newExpense._id }},
      {session}
    );  
  await updateRegister(req.body.registerSession,session);
    await session.commitTransaction();

    res.status(201).json(newExpense);
  } catch (error) {
    await session.abortTransaction();
    console.log(error)
    res.status(400).json({ message: error.message });
  }finally{
    session.endSession();
  }
});

// Update expense
router.put('/update/:id',hasAccess("canAddExpense"), async (req, res) => {
    const session = await mongoose.startSession();

  try {
    const { id } = req.params;
    const { name, amount } = req.body;
    
    // Get the old expense to calculate the difference
    const oldExpense = await Expense.findById(id);
    if (!oldExpense) {
      return res.status(404).json({ message: 'Expense not found' });
    }
    
    const amountDifference = amount - oldExpense.amount;
    session.startTransaction();
    
    // Update the expense
    const updatedExpense = await Expense.findByIdAndUpdate(
      id,
      { name, amount },
      { new: true,session }
    );
    
    // Update register total expenses with the difference
    await updateRegister(oldExpense.registerSession,session);
    await session.commitTransaction();


    res.json(updatedExpense);
  } catch (error) {
    await session.abortTransaction();
    console.log(error)
    res.status(400).json({ message: error.message });
  }finally{
    session.endSession();
  }
});

// Delete expense
router.delete('/delete/:id',hasAccess("canAddExpense"), async (req, res) => {
    const session = await mongoose.startSession();
  try {
    const { id } = req.params;
    
    // Get the expense to subtract its amount from register
    const expense = await Expense.findById(id);
    if (!expense) {
      return res.status(404).json({ message: 'Expense not found' });
    }
    const registerSession = expense.registerSession
    session.startTransaction();
    await Register.findOneAndUpdate(
      { isOpen: true, sessionId: expense.registerSession },
      { $pull: { expenses: expense._id } },
      {session}
    );
    // Delete the expense
    await Expense.findByIdAndDelete(id,{session});
    
  await updateRegister(registerSession,session);
    await session.commitTransaction();

    res.json({ message: 'Expense deleted successfully' });
  } catch (error) {
    await session.abortTransaction();

    console.log(error)
    res.status(500).json({ message: error.message });
  }finally{
    session.endSession();
  }
});

module.exports = router;