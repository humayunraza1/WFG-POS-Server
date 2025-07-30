const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  registerSession: {
    type: String,
    required: true
  },
  cashier: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Account',
    required: false
  },
  serverRef: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    default:null,
    required: false
  },
  branchCode: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Branch',
    default:null
  },
  items: [{
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: true
    },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
   option: {
      type: mongoose.Schema.Types.ObjectId,
      required: true
    },
    optionName: {
      type: String,
      required: true
    },
    unitPrice: {
      type: Number,
      required: true,
      min: 0
    },
    quantity: {
      type: Number,
      required: true,
      min: 1
    },
    totalPrice: {
      type: Number,
      required: true,
      min: 0
    }
  }],
  discount: {
    type: Number,
    default: 0,
    min: 0
  },
  paymentType: {
    type: String,
    enum: ['cash', 'online'],
    required: true
  },
  actualPrice: {
    type: Number,
    required: true,
    min: 0
  },
  finalPrice: {
    type: Number,
    required: true,
    min: 0
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid'],
    default: 'pending'
  },
  outstandingPayment: {
    type: Number,
    default: function () {
      return this.finalPrice;
    },
    min: 0
  },
  amountPaid: {
    type: Number,
    default: 0,
    min: 0
  },
  dateOrdered: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

orderSchema.pre('save', function (next) {
  if (this.amountPaid >= this.finalPrice) {
    this.paymentStatus = 'paid';
    this.outstandingPayment = 0;
    this.amountPaid = this.finalPrice;
  } else {
    this.paymentStatus = 'pending';
    this.outstandingPayment = this.finalPrice - this.amountPaid;
  }
  next();
});

module.exports = mongoose.model('Order', orderSchema);
