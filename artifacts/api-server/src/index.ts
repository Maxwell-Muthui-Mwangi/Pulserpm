import app from "./app";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const SUPER_ADMIN_EMAIL = "maxwellmuthuimwangi@gmail.com";

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

    // Step 2 — ensure Maxwell is a super admin with admin role
    await db.execute(sql`
      UPDATE providers
      SET    is_super_admin = true,
             role           = 'admin'
      WHERE  email = ${SUPER_ADMIN_EMAIL}
        AND  (is_super_admin IS DISTINCT FROM true OR role IS DISTINCT FROM 'admin')
    `);

    console.log(`[bootstrap] Super-admin ensured for ${SUPER_ADMIN_EMAIL}`);
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
