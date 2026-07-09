import { db, providersTable } from "@workspace/db";
import { isNull } from "drizzle-orm";

async function backfill() {
  // Mark any provider that was created before the email-verification feature
  // (identified by having no verification_code set) as already verified,
  // so they are not locked out after the migration.
  await db
    .update(providersTable)
    .set({ emailVerified: true })
    .where(isNull(providersTable.verificationCode));
  console.log("Backfill complete — existing providers marked as verified.");
}

backfill().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
