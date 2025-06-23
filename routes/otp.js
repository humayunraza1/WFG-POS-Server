const express = require('express');
const router = express.Router();
const otpGenerator = require('otp-generator');
const transporter = require('../utils/mailer');

router.post('/send-otp', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  // Generate a 6-digit OTP
const otp = otpGenerator.generate(5, {
  upperCaseAlphabets: false,
  specialChars: false,
  lowerCaseAlphabets: false,
  digits: true
});

  // Send OTP via email
  try {
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Your OTP Code',
      text: `Your OTP code is ${otp}`
    });

    // Store the OTP in session or database (not implemented here)
    // req.session.otp = otp; // Example for session storage

    res.status(200).json({ message: 'OTP sent successfully' });
  } catch (error) {
    console.error('Error sending OTP:', error);
    res.status(500).json({ error: 'Failed to send OTP' });
  }
})

module.exports = router;