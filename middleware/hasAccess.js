const hasAccess = (flag) => (req, res, next) => {
    console.log(req.user.access)
  if (req.user?.access?.[flag]) {
    return next();
  }
  return res.status(403).json({ message: 'Insufficient Permissions. Contact Support.' });
};

module.exports = hasAccess;