const mongoose = require('mongoose');

const branchSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  branchCode:{
    type:String,
    required:true
  },
  address: {
    type: String, required: true ,
  },

  phone: {
    type: String,
    default:null
  },
    managers: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
    }
  ],
  isActive: {
    type: Boolean,
    default: true,
  },

  createdAt: {
    type: Date,
    default: Date.now,
  }
});

module.exports = mongoose.model('Branch', branchSchema);
