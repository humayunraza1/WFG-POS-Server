// utils/mailer.js
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'Gmail',
  auth: {
    user: process.env.EMAIL_USER,      // your.email@gmail.com
    pass: process.env.GOOGLE_APP_PASS   // app password, not regular password
  }
});

module.exports = transporter;
