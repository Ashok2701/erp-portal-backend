"use strict";
/**
 * On-Premise Seed Script
 * Run: npm run seed:onpremise
 *
 * Creates:
 *   1. Default tenant (the company)
 *   2. Default admin user  (admin / Admin@123)
 *   3. All 3 portal grants (CUSTOMER, CONSIGNMENT, SUPPLIER)
 *   4. 4 default roles     (Administrator, Customer, B2B Customer, Supplier)
 *   5. Sets deployment_mode = 'onpremise'
 */

require("dotenv").config();
const { Pool } = require("pg");
const bcrypt   = require("bcrypt");
const crypto   = require("crypto");

const pool = new Pool({
  host:     process.env.DB_HOST,
  port:     Number(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl:      { rejectUnauthorized: false },
});

// Config — override via env vars
const COMPANY_NAME  = process.env.COMPANY_NAME  || "My Company";
const COMPANY_SLUG  = process.env.COMPANY_SLUG  || "company";
const ADMIN_USER    = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASS    = process.env.ADMIN_PASSWORD || "Admin@123";
const ADMIN_EMAIL   = process.env.ADMIN_EMAIL    || "admin@company.com";
const ADMIN_NAME    = process.env.ADMIN_FULLNAME || "System Administrator";

async function seed() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    console.log("🌱 Starting on-premise seed...\n");

    // ── 1. Ensure system_config table ─────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS system_config (
        key VARCHAR(100) PRIMARY KEY,
        value TEXT,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ── 2. Create tenant ──────────────────────────────────
    const tenantId = crypto.randomUUID();
    const existing = await client.query(
      "SELECT tenant_id FROM tenants WHERE slug = $1", [COMPANY_SLUG]
    );

    let finalTenantId;
    if (existing.rows.length) {
      finalTenantId = existing.rows[0].tenant_id;
      console.log(`✅ Tenant already exists: ${COMPANY_NAME} (${COMPANY_SLUG})`);
    } else {
      await client.query(
        `INSERT INTO tenants (tenant_id, tenant_name, slug, plan, is_active, is_test)
         VALUES ($1,$2,$3,'enterprise',true,false)`,
        [tenantId, COMPANY_NAME, COMPANY_SLUG]
      );
      finalTenantId = tenantId;
      console.log(`✅ Tenant created: ${COMPANY_NAME} (${COMPANY_SLUG})`);
    }

    // ── 3. Create tenant_settings row ────────────────────
    await client.query(
      `INSERT INTO tenant_settings (tenant_id, spaces_folder)
       VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [finalTenantId, COMPANY_SLUG]
    );

    // ── 4. Create default roles ───────────────────────────
    const defaultRoles = [
      { code: "ADMINISTRATOR", name: "Administrator" },
      { code: "CUSTOMER",      name: "Customer"      },
      { code: "B2B_CUSTOMER",  name: "B2B Customer"  },
      { code: "SUPPLIER",      name: "Supplier"      },
    ];
    for (const r of defaultRoles) {
      await client.query(
        `INSERT INTO roles (role_id, role_code, role_name, is_active, tenant_id, description)
         VALUES (gen_random_uuid(),$1,$2,true,$3,$4)
         ON CONFLICT DO NOTHING`,
        [r.code, r.name, finalTenantId, r.name + " role"]
      );
    }
    console.log("✅ Default roles created: Administrator, Customer, B2B Customer, Supplier");

    // ── 5. Create admin user ──────────────────────────────
    const existingUser = await client.query(
      "SELECT user_id FROM users WHERE username = $1", [ADMIN_USER]
    );

    let adminUserId;
    if (existingUser.rows.length) {
      adminUserId = existingUser.rows[0].user_id;
      console.log(`✅ Admin user already exists: ${ADMIN_USER}`);
    } else {
      const hash = await bcrypt.hash(ADMIN_PASS, 10);
      const userResult = await client.query(
        `INSERT INTO users
           (user_id, username, email, full_name, password_hash,
            is_active, status, system_role, is_super_admin,
            portal_mode, tenant_id, default_role)
         VALUES (gen_random_uuid(),$1,$2,$3,$4,true,'ACTIVE',
                 'tenant_user',true,'b2c',$5,'Administrator')
         RETURNING user_id`,
        [ADMIN_USER, ADMIN_EMAIL, ADMIN_NAME, hash, finalTenantId]
      );
      adminUserId = userResult.rows[0].user_id;
      console.log(`✅ Admin user created: ${ADMIN_USER} / ${ADMIN_PASS}`);
    }

    // ── 6. Assign Administrator role to admin user ────────
    const adminRole = await client.query(
      "SELECT role_id FROM roles WHERE tenant_id=$1 AND role_name='Administrator' LIMIT 1",
      [finalTenantId]
    );
    if (adminRole.rows.length) {
      await client.query(
        `INSERT INTO user_roles (user_role_id, user_id, role_id)
         VALUES (gen_random_uuid(),$1,$2) ON CONFLICT DO NOTHING`,
        [adminUserId, adminRole.rows[0].role_id]
      );
      console.log("✅ Administrator role assigned to admin user");
    }

    // ── 7. Grant all 3 portals ────────────────────────────
    for (const portal of ["CUSTOMER", "CONSIGNMENT", "SUPPLIER"]) {
      await client.query(
        `INSERT INTO tenant_portal_grants
           (tenant_id, portal_type, is_active, granted_by, granted_at)
         VALUES ($1,$2,true,$3,NOW())
         ON CONFLICT (tenant_id, portal_type) DO UPDATE SET is_active=true`,
        [finalTenantId, portal, adminUserId]
      );
    }
    console.log("✅ All 3 portals granted: CUSTOMER, CONSIGNMENT, SUPPLIER");

    // ── 8. Set deployment mode ────────────────────────────
    await client.query(
      `INSERT INTO system_config (key, value, updated_at)
       VALUES ('deployment_mode','onpremise',NOW())
       ON CONFLICT (key) DO UPDATE SET value='onpremise', updated_at=NOW()`
    );
    console.log("✅ Deployment mode set to: onpremise");

    await client.query("COMMIT");

    console.log("\n🎉 Seed complete!\n");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`  Company : ${COMPANY_NAME}`);
    console.log(`  URL     : http://your-server`);
    console.log(`  Login   : ${ADMIN_USER}`);
    console.log(`  Password: ${ADMIN_PASS}`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("\n⚠  Change the admin password after first login!\n");

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Seed failed:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
