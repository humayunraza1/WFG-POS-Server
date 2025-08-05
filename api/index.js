const serverless = require('serverless-http');
const app = require('../index'); // Express app in root
module.exports = serverless(app);
