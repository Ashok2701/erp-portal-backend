const bcrypt = require("bcrypt");
const UserModel = require("../models/user.model");
const pool = require("../config/db");
const UserErpMappingModel = require("../models/userErpMapping.model");


exports.createUser = async (req, res) => {
  try {
    const { username, password,email, full_name, role_code } = req.body;
    const { tenant_id } = req.user;

    if (!username || !password || !role_code) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const password_hash = await bcrypt.hash(password, 10);

    const user = await UserModel.createUser({
      tenant_id,
      username,
      email,
      password_hash,
      full_name
    });

    // Assign role
    await pool.query(
      `
      INSERT INTO user_roles (user_id, role_id)
      SELECT $1, role_id FROM roles WHERE role_code = $2
      `,
      [user.user_id, role_code]
    );

    res.status(201).json({
      message: "User created successfully",
      user
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

