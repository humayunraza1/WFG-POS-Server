// models/Role.js
import mongoose from 'mongoose';

const RoleSchema = new mongoose.Schema({
  businessRef: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business',
    required: true
  },
  name: {
    type: String,
    required: true,
    unique:true,
    trim: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

export default mongoose.model('Role', RoleSchema);
