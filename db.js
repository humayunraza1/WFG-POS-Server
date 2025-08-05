// Server/db.js
const mongoose = require('mongoose');

const mongoUri = process.env.MONGODB_URI;

if (!mongoUri) {
  throw new Error('MONGODB_URI not set in environment');
}

// Use a global to cache the connection across lambda invocations
let cached = global._mongoose_cached;

if (!cached) {
  cached = global._mongoose_cached = { conn: null, promise: null };
}

async function connect() {
  if (cached.conn) {
    return cached.conn;
  }
  if (!cached.promise) {
    const opts = {
      // Recommended options
      useNewUrlParser: true,
      useUnifiedTopology: true,
      // poolSize and other options can be tuned for serverless if needed
    };
    cached.promise = mongoose.connect(mongoUri, opts).then((mongooseInstance) => {
      return mongooseInstance;
    });
  }
  cached.conn = await cached.promise;
  return cached.conn;
}

module.exports = connect;
