const mongoose = require('mongoose');

const PAYMENT_TYPES = {
  ADVANCE: 'Advance',
  BONUS: 'Bonus',
  DEDUCTION: 'Deduction',
  SALARY: 'Salary'
};

const employeePaymentSchema = new mongoose.Schema({
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
  manager: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
  amount: { type: Number, required: true },
  date: { type: Date, default: Date.now },
  deductible: { type: Boolean, default: true }, // <- THIS LINE
  type: {
    type: String,
    enum: Object.values(PAYMENT_TYPES),
    required: true
  },
  note: String
});

module.exports = {
  EmployeePayment: mongoose.model('EmployeePayment', employeePaymentSchema),
  PAYMENT_TYPES
};
