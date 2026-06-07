const jwt  = require("jsonwebtoken");
const bcrypt = require("bcrypt");

const UserModel  = require("../models/user.model");
const RoleModel = require("../models/role.model");
const ModuleModel = require("../models/module.model");


function resolveErpContext(user) {
  let erp_customer_code = null;
  let erp_supplier_code = null;

  if (user.erp_entity_type === 'customer') {
    erp_customer_code = user.erp_entity_code;
  }
  else if (user.erp_entity_type === 'supplier') {
    erp_supplier_code = user.erp_entity_code;
  }

  return {
    erp_customer_code,
    erp_supplier_code
  };
}

exports.login = async (req, res) => {



 const {username, password} = req.body;

 const user = await UserModel.findByUsername(username)


if(!user) {
    return res.status(401).json({message : "User doesn't exist"});
 }

 if(!user.is_active && user.status !== 'IN_VERIFICATION' && user.status !== 'PENDING_APPROVAL') {
    return res.status(401).json({message : "User is inactive"});
 }


// if(!user.is_active) {
//    return res.status(401).json({message : "User is inactive"});
// }


 if (user.status === 'PENDING_REVIEW') {
   // throw new Error("Your account is pending review. Please wait for admin approval.");
    return res.status(401).json({message : "Your account is pending review. Please wait for admin approval."});
 }
 if (user.status === 'REJECTED') {
  // throw new Error("Your account has been rejected. Please contact support.");
   return res.status(401).json({message : "Your account has been rejected. Please contact support."});
 }


const erpContext = resolveErpContext(user);
 console.log("user is", username)
 console.log("passwrod from body", password);
  console.log("passwrod from body", user.password_hash);
 //console.log("password after bcrpt", bcrypt(password))
bcrypt.hash("Password@123",10).then(console.log);

 const isValid = await bcrypt.compare(password, user.password_hash);

 console.log("passwrod valid", isValid);


 if(!isValid) {
    return res.status(401).json({message : "Invalid credentails"});
 }

const roles = await RoleModel.getRolesByUserId(user.user_id);

const roleName = roles.length > 0 ? roles[0].role_name : (user.requested_role || 'Customer');
const expiresIn = process.env.JWT_EXPIRES_IN || "8h";


 const token = jwt.sign({
    user_id : user.user_id,
    tenant_id : user.tenant_id,
    role : roleName || "CUSTOMER",
 },

   process.env.JWT_SECRET,
   {expiresIn}

);

res.json({token,  user: {
                     user_id:        user.user_id,
                     tenant_id:      user.tenant_id,
                     username:       user.username,
                     role:           roleName || "CUSTOMER",
                     erp_customer_code: erpContext.erp_customer_code,
                     erp_supplier_code: erpContext.erp_supplier_code,
                     status:         user.status || "ACTIVE",
                     allowedsite:    user.allowedsite,
                     portal_mode:    user.portal_mode || "b2c",
                     is_super_admin: user.is_super_admin || false,
                     roles
                   }
                   });
}





exports.getMe = async (req , res) => {
   try {
   const { user_id, tenant_id, username, role, status,
           portal_mode, is_super_admin, tenant_slug } = req.user;

   const roles = await RoleModel.getRolesByUserId(user_id);

   // Get full user details from DB
   const userResult = await db.query(
     `SELECT u.allowedsite, u.erp_entity_type, u.erp_entity_code,
             u.full_name, u.email
      FROM users u WHERE u.user_id = $1`, [user_id]
   );
   const extra = userResult.rows[0] || {};

   res.json({
      user_id,
      tenant_id,
      tenant_slug,
      username,
      role,
      status,
      portal_mode:    portal_mode    || 'b2c',
      is_super_admin: is_super_admin || false,
      allowedsite:    extra.allowedsite,
      erp_customer_code: extra.erp_entity_code,
      full_name:      extra.full_name,
      email:          extra.email,
      roles
   });
   }
   catch (err) {
      console.error("GET ME ERROR", err);
      res.status(500).json({message : "Failed to Load user info"});
   }
}

exports.getModules = async (req , res) => {
   try {
 
        const {user_id} = req.user;

        const modules = await ModuleModel.getModulesByUserId(user_id);

        res.json({modules})
   }
   catch (err) {
      console.error("GET Modules ERROR", err);
      res.status(500).json({message : "Failed to Load Modules"});
   }
}





















