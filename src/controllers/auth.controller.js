const jwt  = require("jsonwebtoken");
const bcrypt = require("bcrypt");

const UserModel  = require("../models/user.model");
const RoleModel = require("../models/role.model");
const ModuleModel = require("../models/module.model");


exports.login = async (req, res) => {

 const {username, password} = req.body;

 const user = await UserModel.findByUsername(username)

if(!user) {
    return res.status(401).json({message : "User doesn't exist"});
 }


 if(!user.is_active) {
    return res.status(401).json({message : "User is inactive"});
 }

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
 const expiresIn = process.env.JWT_EXPIRES_IN || "8h";

 const token = jwt.sign({
    user_id : user.user_id,
    tenant_id : user.tenant_id,
    role : roles[0].role_name
 },

   process.env.JWT_SECRET,
   {expiresIn}

);

res.json({token,  user: {
                     user_id: user.user_id,
                     tenant_id: user.tenant_id,
                     username: user.username,
                     roles

                   }
                   });
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





















