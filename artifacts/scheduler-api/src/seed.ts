import { db } from "./lib/db.js";
import { schedulerTutorsTable } from "./schema/index.js";
import { eq } from "drizzle-orm";
import { hashPassword } from "./lib/auth.js";
import { logger } from "./lib/logger.js";

const TUTOR_EMAIL = process.env.SEED_TUTOR_EMAIL ?? "tobiasbilla@gmail.com";
const TUTOR_NAME = process.env.SEED_TUTOR_NAME ?? "Tobias Billa";
const TUTOR_PASSWORD = process.env.SEED_TUTOR_PASSWORD;

if (!TUTOR_PASSWORD) {
  logger.error("SEED_TUTOR_PASSWORD environment variable is required to seed a tutor account");
  process.exit(1);
}

async function seed() {
  logger.info("Starting scheduler seed...");

  const [existing] = await db
    .select({ id: schedulerTutorsTable.id })
    .from(schedulerTutorsTable)
    .where(eq(schedulerTutorsTable.email, TUTOR_EMAIL));

  if (existing) {
    logger.info({ tutorId: existing.id }, "Default tutor already exists, skipping");
    process.exit(0);
  }

  const passwordHash = await hashPassword(TUTOR_PASSWORD as string);
  const [tutor] = await db
    .insert(schedulerTutorsTable)
    .values({ name: TUTOR_NAME, email: TUTOR_EMAIL, passwordHash })
    .returning({ id: schedulerTutorsTable.id, email: schedulerTutorsTable.email });

  logger.info({ tutorId: tutor.id, email: tutor.email }, "Default tutor created");
  process.exit(0);
}

seed().catch((err) => {
  logger.error({ err }, "Seed failed");
  process.exit(1);
});
