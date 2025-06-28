const mongoose = require('mongoose');

const employeeSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
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
  accountRef: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Account'
  }
}, { timestamps: true });

module.exports = mongoose.model('Employee', employeeSchema);
