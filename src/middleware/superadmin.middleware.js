"use strict";
module.exports = (req, res, next) => {
  if (!req.user) return res.status(401).json({ message: "Unauthorized" });
  if (!req.user.is_super_admin)
    return res.status(403).json({ message: "SuperAdmin access required" });
  next();
};
