// api/index.js
const serverless = require('serverless-http');
const app = require('../index.js'); // adjust path if needed

module.exports = serverless(app);
