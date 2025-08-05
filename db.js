const mongoose = require('mongoose');

let cached = global._mongooseCached;

if (!cached) {
  cached = global._mongooseCached = { conn: null, promise: null };
}

async function connectDB() {
  if (cached.conn) return cached.conn;
  if (!cached.promise) {
    cached.promise = mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    }).then(mongooseInstance => mongooseInstance);
  }
  cached.conn = await cached.promise;
  return cached.conn;
}

module.exports = connectDB;
