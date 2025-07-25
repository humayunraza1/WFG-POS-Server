const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const accountSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true, 
    trim: true,
    minlength: 3,
    maxlength: 50
  },
  isActive:{
    type: Boolean,
    default:true
  },
  password: {
    type: String,
    required: true
  },
    access: {
    isAdmin: { type: Boolean, default: false },
    isManager: { type: Boolean, default: false },
    isCashier: { type: Boolean, default: false},
    canViewOrders: { type: Boolean, default: false },
    canViewAllRegisters: { type: Boolean, default: false },
    canGenReport: { type: Boolean, default: false }
  },
      branchCode: {
      type: String,
      default:null
    },

    employeeRef: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    default: null
  }
}, {
  timestamps: true
});


// Hash password before saving
accountSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
accountSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};
module.exports = mongoose.model('Account', accountSchema);