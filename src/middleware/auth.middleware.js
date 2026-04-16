const jwt = require("jsonwebtoken");

module.exports = (req, res, next) => {

  const authHeader = req.headers.authorization;

  if(!authHeader) {

    return res.status(401).json({message : "Authorization header missing"});
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // Fetch role from DB
       const userResult = await db.query(
         'SELECT r.role_name FROM user_roles ur JOIN roles r ON ur.role_id = r.role_id WHERE ur.user_id = $1 LIMIT 1',
         [decoded.user_id]
       );

       req.user = {
         id: decoded.user_id,
         user_id: decoded.user_id,
         tenant_id: decoded.tenant_id,
         role: userResult.rows[0]?.role_name || 'Customer'
       };
    next();
  }
  catch (err) {
    return res.status(403).json({message : "Invalid or expired token"});
  }


}