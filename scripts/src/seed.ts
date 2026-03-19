import { db, providersTable, patientsTable, vitalsTable, thresholdsTable } from "@workspace/db";
import crypto from "crypto";

const JWT_SECRET = process.env.JWT_SECRET || "rpm-secret-key-change-in-production";

function hashPassword(password: string): string {
  return crypto.createHmac("sha256", JWT_SECRET).update(password).digest("hex");
}

function randomBetween(min: number, max: number): number {
  return Math.round((Math.random() * (max - min) + min) * 10) / 10;
}

function hoursAgo(h: number): Date {
  return new Date(Date.now() - h * 60 * 60 * 1000);
}

async function seed() {
  console.log("🌱 Seeding database...");

  const [provider1] = await db
    .insert(providersTable)
    .values({
      name: "Dr. Sarah Mitchell",
      email: "sarah.mitchell@rpmhospital.com",
      passwordHash: hashPassword("password123"),
      specialty: "Cardiology",
      role: "provider",
    })
    .onConflictDoNothing()
    .returning();

  const [provider2] = await db
    .insert(providersTable)
    .values({
      name: "Dr. James Carter",
      email: "james.carter@rpmhospital.com",
      passwordHash: hashPassword("password123"),
      specialty: "Internal Medicine",
      role: "provider",
    })
    .onConflictDoNothing()
    .returning();

  console.log("✅ Providers created");

  const patientData = [
    {
      name: "Eleanor Thompson",
      email: "eleanor.thompson@email.com",
      password: "patient123",
      dateOfBirth: "1945-03-12",
      gender: "female",
      conditions: ["Hypertension", "Type 2 Diabetes"],
      providerId: provider1?.id,
      deviceType: "apple_health",
    },
    {
      name: "Robert Johnson",
      email: "robert.johnson@email.com",
      password: "patient123",
      dateOfBirth: "1950-07-24",
      gender: "male",
      conditions: ["COPD", "Heart Failure"],
      providerId: provider1?.id,
      deviceType: "google_fit",
    },
    {
      name: "Margaret Williams",
      email: "margaret.williams@email.com",
      password: "patient123",
      dateOfBirth: "1942-11-05",
      gender: "female",
      conditions: ["Atrial Fibrillation"],
      providerId: provider2?.id,
      deviceType: "fitbit",
    },
    {
      name: "Harold Davis",
      email: "harold.davis@email.com",
      password: "patient123",
      dateOfBirth: "1938-05-18",
      gender: "male",
      conditions: ["Hypertension", "Coronary Artery Disease", "Type 2 Diabetes"],
      providerId: provider2?.id,
      deviceType: "manual",
    },
    {
      name: "Dorothy Brown",
      email: "dorothy.brown@email.com",
      password: "patient123",
      dateOfBirth: "1955-09-30",
      gender: "female",
      conditions: ["Asthma"],
      providerId: provider1?.id,
      deviceType: "garmin",
    },
  ];

  const patients = [];
  for (const pd of patientData) {
    const [patient] = await db
      .insert(patientsTable)
      .values({
        name: pd.name,
        email: pd.email,
        passwordHash: hashPassword(pd.password),
        dateOfBirth: pd.dateOfBirth,
        gender: pd.gender,
        conditions: pd.conditions,
        providerId: pd.providerId,
        deviceType: pd.deviceType,
        role: "patient",
      })
      .onConflictDoNothing()
      .returning();
    if (patient) {
      patients.push(patient);
      await db.insert(thresholdsTable).values({ patientId: patient.id }).onConflictDoNothing();
    }
  }

  console.log(`✅ ${patients.length} patients created`);

  for (const patient of patients) {
    const readings = [];
    for (let i = 47; i >= 0; i--) {
      const isHighRisk = patient.conditions.includes("Hypertension") || patient.conditions.includes("Heart Failure");
      readings.push({
        patientId: patient.id,
        heartRate: randomBetween(isHighRisk ? 55 : 62, isHighRisk ? 115 : 95),
        systolicBp: randomBetween(isHighRisk ? 130 : 108, isHighRisk ? 165 : 138),
        diastolicBp: randomBetween(isHighRisk ? 80 : 68, isHighRisk ? 105 : 88),
        spo2: randomBetween(patient.conditions.includes("COPD") ? 88 : 93, 99),
        caloriesBurned: randomBetween(50, 250),
        temperature: randomBetween(36.1, 37.4),
        source: (patient.deviceType || "manual") as "apple_health" | "google_fit" | "fitbit" | "garmin" | "manual" | "simulated",
        recordedAt: hoursAgo(i),
      });
    }

    await db.insert(vitalsTable).values(readings);
  }

  console.log("✅ Vitals history seeded (48h of readings per patient)");
  console.log("\n🔑 Login credentials:");
  console.log("  Provider: sarah.mitchell@rpmhospital.com / password123");
  console.log("  Provider: james.carter@rpmhospital.com / password123");
  console.log("  Patient:  eleanor.thompson@email.com / patient123");
  console.log("\n✨ Seeding complete!");
}

seed().catch(console.error).finally(() => process.exit(0));
