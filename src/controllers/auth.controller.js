const jwt  = require("jsonwebtoken");
const bcrypt = require("bcrypt");

const UserModel  = require("../models/user.model");
const RoleModel = require("../models/role.model");
const ModuleModel = require("../models/module.model");


exports.login = async (req, res) => {

 const {username, password} = req.body;

 const user = await UserModel.findByUsername(username)

 if(!user || !user.is_active) {
    return res.status(401).json({message : "Invalid credentails"});
 }


 const isValid = await bcrypt.compare(password, user.password_hash);

 if(!isValid) {
    return res.status(401).json({message : "Invalid credentails"});
 }


 const expiresIn = process.env.JWT_EXPIRES_IN || "8h";

 const token = jwt.sign({
    user_id : user.user_id,
    tenant_id : user.tenant_id,
 },

   process.env.JWT_SECRET,
   {expiresIn}

);

res.json({token});
}





exports.getMe = async (req , res) => {
   try {

   const {user_id , tenant_id} = req.user;

   const roles = await RoleModel.getRolesByUserId(user_id);

   res.json({
      user_id,tenant_id, roles
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





















