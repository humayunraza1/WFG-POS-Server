const express = require('express');
const mongoose = require('mongoose');
const authenticate = require('../middleware/authenticate');
const hasAccess = require('../middleware/hasAccess');
const { EmployeePayment, PAYMENT_TYPES } = require('../models/EmployeePayment');
const Employees = require('../models/Employees');
const Account = require('../models/Account');
const router = express.Router();

router.use(authenticate);

router.get('/:id/payments', hasAccess("isManager"), async (req, res) => {
  const employeeId = req.params.id;
  let { month, year } = req.query;
  const now = new Date();
    month = parseInt(month) || now.getMonth() + 1; // JS months are 0-indexed
    year = parseInt(year) || now.getFullYear();
    const employee = await Employees.findById(employeeId);
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    const cycleDay = employee.salaryCycleStartDay || 1;
    console.log("Employee Salary Cycle Start Day:", cycleDay);
const cycleStart = new Date(year, month - 1, cycleDay + 2); // current month
const cycleEnd = new Date(cycleStart);
cycleEnd.setMonth(cycleStart.getMonth() + 1);
cycleEnd.setDate(cycleEnd.getDate() - 2); // one day before next cycle start
cycleEnd.setHours(23, 59, 59, 999);
console.log("Cycle Start:", cycleStart);
console.log("Cycle End:", cycleEnd);
  try {


    const payments = await EmployeePayment.aggregate([
      {
        $match: {
          employee: new mongoose.types.ObjectId(employeeId),
          date: { $gte: cycleStart, $lte: cycleEnd }
        }
      },
      {
        $lookup: {
          from: 'employees', // collection name where managers are stored
          localField: 'manager',
          foreignField: '_id',
          as: 'manager'
        }
      },
      {
        $unwind: {
          path: '$manager',
          preserveNullAndEmptyArrays: true // in case manager is deleted
        }
      },
      {
        $project: {
          amount: 1,
          date: 1,
          note: 1,
          type: 1,
          deductible: 1,
          managerName: '$manager.name'
        }
      }
    ]);

    // Grouping manually in JS now
    const summary = {
      cycleStart: cycleStart.toISOString().split('T')[0],
      cycleEnd: cycleEnd.toISOString().split('T')[0],
      employee: employee.name,
      monthlySalary: employee.salary,
      paidAsAdvance: 0,
      paidAsBonus: 0,
      deductions: 0,
      finalSalaryPaid: 0,
      totalPaid: 0,
      remainingSalary: employee.salary,
      paymentHistory: []
    };

    for (const payment of payments) {
      switch (payment.type) {
        case 'Advance':
          summary.paidAsAdvance += payment.amount;
          break;
        case 'Bonus':
          summary.paidAsBonus += payment.amount;
          break;
        case 'Deduction':
          summary.deductions += payment.amount;
          break;
        case 'Salary':
          summary.finalSalaryPaid += payment.amount;
          break;
      }

      summary.paymentHistory.push({
        amount: payment.amount,
        date: payment.date,
        note: payment.note,
        type: payment.type,
        deductible: payment.deductible,
        manager: payment.managerName || 'N/A'
      });
    }
    summary.remainingSalary = summary.monthlySalary - summary.paidAsAdvance - summary.deductions - summary.finalSalaryPaid;
    summary.totalPaid = summary.paidAsAdvance + summary.paidAsBonus + summary.finalSalaryPaid;
    return res.json(summary);
  } catch (err) {
    console.error('Error fetching payments summary:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});


// POST /employees/:id/payments
router.post('/pay/:id',hasAccess("isManager"), async (req, res) => {
  const employeeId = req.params.id;
  const { amount, type, date, note, deductible } = req.body;
    const {userId} = req.user;
    const managerAcc = await Account.findById(userId).populate('employeeRef');
  if (!amount || !type) {
    return res.status(400).json({ error: 'Amount and type are required' });
  }

  if (!Object.values(PAYMENT_TYPES).includes(type)) {
    return res.status(400).json({ error: `Invalid payment type. Must be one of: ${Object.values(PAYMENT_TYPES).join(', ')}` });
  }

  try {
    const employee = await Employees.findById(employeeId);
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    console.log("Manager Account:", managerAcc);
    console.log(req.body)
    const payment = new EmployeePayment({
      employee: employeeId,
      manager: managerAcc.employeeRef._id, // Assuming userId is the ID of the manager making the payment
      amount,
      type,
      date: date ? new Date(date) : new Date(),
      note,
      deductible: typeof deductible === 'boolean' ? deductible : true // default true
    });
    console.log("Payment object:", payment);
    await payment.save();

    return res.status(201).json({ message: 'Payment recorded successfully', payment });
  } catch (err) {
    console.error('Error recording payment:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;