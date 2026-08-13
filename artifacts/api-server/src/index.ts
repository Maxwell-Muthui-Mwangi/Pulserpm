import app from "./app";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { hashPassword } from "./lib/auth.js";

const SUPER_ADMIN_EMAIL  = "maxwellmuthuimwangi@gmail.com";
const GEORGE_EMAIL       = "georgewainaina058@gmail.com";
const GEORGE_NAME        = "George Wainaina";
const GEORGE_ADMIN_ROLE  = "Security Admin";

/**
 * Idempotent startup bootstrap — runs on every server start in every environment.
 *
 * 1. Adds is_super_admin / is_manager columns to providers if they don't exist yet
 *    (safe for production databases that haven't been published yet).
 * 2. Ensures Maxwell's row has is_super_admin = true and role = 'admin'.
 *
 * All statements use IF NOT EXISTS / WHERE guards so re-running is always safe.
 */
async function bootstrapSuperAdmin() {
  try {
    // Step 1 — ensure the columns exist (no-op if already there)
    await db.execute(sql`
      ALTER TABLE providers
        ADD COLUMN IF NOT EXISTS is_super_admin boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS is_manager     boolean NOT NULL DEFAULT false
    `);

    await db.execute(sql`
      ALTER TABLE patients
        ADD COLUMN IF NOT EXISTS deleted_at timestamp,
        ADD COLUMN IF NOT EXISTS is_admin_patient boolean NOT NULL DEFAULT false
    `);

    // Mark Maxwell's patient record so his vitals are excluded from platform analytics
    await db.execute(sql`
      UPDATE patients
      SET    is_admin_patient = true
      WHERE  email = ${SUPER_ADMIN_EMAIL}
        AND  is_admin_patient IS DISTINCT FROM true
    `);

    // Step 2 — add admin_role column (display label for super admins)
    await db.execute(sql`
      ALTER TABLE providers
        ADD COLUMN IF NOT EXISTS admin_role text
    `);

    // Step 3 — ensure Maxwell is a ghost super admin with God Level label
    await db.execute(sql`
      UPDATE providers
      SET    is_super_admin = true,
             role           = 'admin',
             admin_role     = 'God Level'
      WHERE  email = ${SUPER_ADMIN_EMAIL}
        AND  (is_super_admin IS DISTINCT FROM true OR role IS DISTINCT FROM 'admin' OR admin_role IS DISTINCT FROM 'God Level')
    `);

    // Step 4 — ensure George Wainaina exists as Security Admin super admin
    const georgeHash = hashPassword("gashofe12345");
    await db.execute(sql`
      INSERT INTO providers (name, email, password_hash, role, is_super_admin, admin_role, email_verified, approved, approved_at, created_at, updated_at)
      VALUES (
        ${GEORGE_NAME},
        ${GEORGE_EMAIL},
        ${georgeHash},
        'admin',
        true,
        ${GEORGE_ADMIN_ROLE},
        true,
        true,
        NOW(),
        NOW(),
        NOW()
      )
      ON CONFLICT (email) DO UPDATE
      SET
        is_super_admin = true,
        admin_role     = ${GEORGE_ADMIN_ROLE},
        role           = 'admin',
        email_verified = true,
        approved       = true,
        updated_at     = NOW()
    `);

    console.log(`[bootstrap] Super-admin (God Level) ensured for ${SUPER_ADMIN_EMAIL}`);
    console.log(`[bootstrap] Super-admin (Security Admin) ensured for ${GEORGE_EMAIL}`);
  } catch (err) {
    // Log but never crash the server — schema may already be correct
    console.error("[bootstrap] Super-admin bootstrap error:", err);
  }
}

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, async () => {
  console.log(`Server listening on port ${port}`);

  // Bootstrap: ensure production DB has the right columns and Maxwell's god-level flag
  await bootstrapSuperAdmin();

  // Email transport diagnostics — helps pinpoint delivery configuration issues
  const resendKey   = !!process.env.RESEND_API_KEY;
  const resendFrom  = process.env.RESEND_FROM_EMAIL ?? "(not set)";
  const smtpUser    = process.env.SMTP_USER;
  const smtpPass    = !!process.env.SMTP_PASS;
  const smtpHost    = process.env.SMTP_HOST ?? "(auto-detect)";
  const smtpDomain  = smtpUser ? smtpUser.split("@")[1] ?? "?" : "(not set)";

  console.log("[email] Config check —");
  console.log(`  Resend API key: ${resendKey ? "✓ set" : "✗ missing"}`);
  console.log(`  Resend from:    ${resendFrom}`);
  console.log(`  SMTP user:      ${smtpUser ? `✓ set (@${smtpDomain})` : "✗ missing"}`);
  console.log(`  SMTP pass:      ${smtpPass ? "✓ set" : "✗ missing"}`);
  console.log(`  SMTP host:      ${smtpHost}`);
  if (!resendKey && !smtpUser) {
    console.warn("[email] ⚠  No email transport configured — verification codes will only appear as fallback in API responses.");
  }
});
