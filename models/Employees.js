const mongoose = require('mongoose');

const employeeSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
    branchCode: {
      type: String,
      default:null
    },
  email: {
    type: String,
    trim: true
  },
  phone: {
    type: String,
    trim: true
  },
  salary: {
    type: Number,
    default: 0
  },
  role: {
    type: String,
    required: true,
    enum: ['cashier', 'manager', 'chef', 'waiter', 'cleaner', 'company','admin']
  },
    salaryCycleStartDay: {
    type: Number,
    min: 1,
    max: 28,
    default: 1 // <-- NEW
  }
}, { timestamps: true });

module.exports = mongoose.model('Employee', employeeSchema);
