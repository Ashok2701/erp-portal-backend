const bcrypt = require("bcrypt");
const UserModel = require("../models/user.model");
const RoleModel= require("../models/role.model")
const pool = require("../config/db");
const UserErpMappingModel = require("../models/userErpMapping.model");

exports.createUser = async (req, res) => {
  try {
    const {
      username,
      password,
      full_name,
      email,
      is_active,
      contact_number,
      whatsapp_number,
      country_code,
      erp_entity_type,
      erp_entity_code,
      role_code   // 👈 from frontend
    } = req.body;

    const { tenant_id } = req.user;

    // check duplicate
    const exists = await UserModel.checkUsernameExists(username);
    if (exists) {
      return res.status(400).json({ message: "Username already exists" });
    }

    const password_hash = await bcrypt.hash(password, 10);

    // create user
    const user = await UserModel.createUser({
      tenant_id,
      username,
      password_hash,
      full_name,
      email,
      is_active,
      contact_number,
      whatsapp_number,
      country_code,
      erp_entity_type,
      erp_entity_code
    });

    // 🔥 Convert role_code → role_id
    if (role_code) {
      const role = await RoleModel.getRoleIdByCode(role_code);

      if (!role) {
        return res.status(400).json({ message: "Invalid role_code" });
      }

      await UserModel.assignRoles(user.user_id, [role.role_id]);
    }

    res.json({
      message: "User created successfully",
      user_id: user.user_id
    });

  } catch (err) {
    console.error("CREATE USER ERROR:", err);
    res.status(500).json({ message: "Failed to create user" });
  }
};

exports.listUsers = async (req, res) => {
  try {
    const { tenant_id } = req.user;
    const users = await UserModel.getAllUsers(tenant_id);
    res.json({ users });
  } catch (err) {
    console.error("LIST USERS ERROR:", err);
    res.status(500).json({ message: "Failed to load users" });
  }
};


exports.mapUserToErp = async (req, res) => {
  try {
    const { userId } = req.params;
    const { erp_system, erp_entity_type, erp_entity_code } = req.body;

    if (!erp_system || !erp_entity_type || !erp_entity_code) {
      return res.status(400).json({
        message: "erp_system, erp_entity_type, erp_entity_code are required"
      });
    }

    const mapping = await UserErpMappingModel.upsertMapping({
      user_id: userId,
      erp_system,
      erp_entity_type,
      erp_entity_code
    });

    res.json({
      message: "ERP mapping saved successfully",
      mapping
    });

  } catch (err) {
    console.error("ERP MAPPING ERROR:", err);
    res.status(500).json({ message: "Failed to save ERP mapping" });
  }
};

exports.checkUsername = async (req, res) => {
  try {
    const { username } = req.params;

    const exists = await UserModel.checkUsernameExists(username);

    res.json({
      exists
    });

  } catch (err) {
    console.error("CHECK USERNAME ERROR:", err);
    res.status(500).json({ message: "Error checking username" });
  }
};


exports.updateUser = async (req, res) => {
  try {
    const { id } = req.params;

    const {
      full_name,
      email,
      
      contact_number,
      whatsapp_number,
      erp_entity_type,
      erp_entity_code,
      is_active,
      role_code
    } = req.body;

    
    // update user
    await UserModel.updateUser(id, {
      full_name,
      email,
      contact_number,
      whatsapp_number,
      erp_entity_type,
      erp_entity_code,
      is_active
    });

  if (role_code) {
  const role = await RoleModel.getRoleIdByCode(role_code);

  await UserModel.updateUserRoles(id, [role.role_id]);
}
    res.json({
      message: "User updated successfully"
    });

  } catch (err) {
    console.error("UPDATE USER ERROR:", err);
    res.status(500).json({ message: "Failed to update user" });
  }
};


exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    await UserModel.deleteUser(id);

    res.json({
      message: "User deleted successfully"
    });

  } catch (err) {
    console.error("DELETE USER ERROR:", err);
    res.status(500).json({ message: "Failed to delete user" });
  }
};

exports.getUserById = async (req, res) => {
  try {
    const { id } = req.params;

     const userdetailsbyID = await UserModel.getUserById(id);
    res.json({ userdetailsbyID });

  } catch (err) {
    console.error("Fetching user details ERROR:", err);
    res.status(500).json({ message: "Failed to get user details" });
  }
};

