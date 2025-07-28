const mongoose = require('mongoose');
const businessSchema = new mongoose.Schema({
  name: String,
  email: {
    type:String,
    default:null
},
  isActive:{
    type:Boolean,
    default:true
  },
  preferences: {
    trackServers: { type: Boolean, default: false }, // business-wide feature toggle
  }
});
module.exports = mongoose.model('Business', businessSchema);