const hasAccess = (flag) => (req, res, next) => {
  if (req.user?.access?.[flag]) {
    return next();
  }
  return res.status(403).json({ message: 'Insufficient Permissions. Contact Support.' });
};

module.exports = hasAccess;