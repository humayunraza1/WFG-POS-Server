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
    type: String,
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
    categoryName: {
      type: String,
      default: ''
    },
    isPartnershipCategory: {
      type: Boolean,
      default: false
    },
    partnershipBusinessName: {
      type: String,
      default: ''
    },
    partnershipSharePercent: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },
    dealName: {
      type: String,
      default: ''
    },
    dealSelectionLabel: {
      type: String,
      default: ''
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
  discountType: {
    type: String,
    enum: ['amount', 'percentage'],
    default: 'amount'
  },
  discountValue: {
    type: Number,
    default: 0,
    min: 0
  },
  tax: {
    type: Number,
    default: 0,
    min: 0
  },
  taxRate: {
    type: Number,
    default: 0,
  },
  paymentType: {
    type: String,
    enum: ['cash', 'online', 'card'],
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
