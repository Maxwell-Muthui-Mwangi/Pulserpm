/**
 * HealthKitService — iOS HealthKit integration via react-native-health.
 *
 * Mirrors the interface of HealthConnectService so BackgroundSync and
 * AppContext can call a unified API regardless of platform.
 *
 * iOS only. Returns empty / false on other platforms without throwing.
 * Silently no-ops in Expo Go (AppleHealthKit native module is unavailable).
 */
import { Platform } from "react-native";

export interface HKVitalReading {
  heartRate?: number;
  spo2?: number;
  systolicBp?: number;
  diastolicBp?: number;
  temperature?: number;
}

export interface HKPermissions {
  heartRate: boolean;
  spo2: boolean;
  bloodPressure: boolean;
  temperature: boolean;
}

// Lazy-loaded so the Android bundle never imports a native iOS module.
type RNHealth = typeof import("react-native-health");
let _hk: RNHealth | null = null;
let _initialized = false;
let _initError = false;

async function getHK(): Promise<RNHealth | null> {
  if (Platform.OS !== "ios") return null;
  if (_hk) return _hk;
  try {
    const mod = await import("react-native-health");
    _hk = mod;
    return mod;
  } catch {
    // Not available in Expo Go or non-HealthKit builds
    return null;
  }
}

/** Promisify initHealthKit. Resolves true on success. */
function initHK(hk: RNHealth): Promise<boolean> {
  return new Promise((resolve) => {
    const { Permissions } = hk.default.Constants;
    const perms: import("react-native-health").HealthKitPermissions = {
      permissions: {
        read: [
          Permissions.HeartRate,
          Permissions.OxygenSaturation,
          Permissions.BloodPressureSystolic,
          Permissions.BloodPressureDiastolic,
          Permissions.BodyTemperature,
        ],
        write: [],
      },
    };
    hk.default.initHealthKit(perms, (err: string) => {
      resolve(!err);
    });
  });
}

async function ensureInit(): Promise<RNHealth | null> {
  const hk = await getHK();
  if (!hk) return null;
  if (_initError) return null;
  if (_initialized) return hk;
  const ok = await initHK(hk);
  if (ok) {
    _initialized = true;
    return hk;
  }
  _initError = true;
  return null;
}

/** Check whether HealthKit is available and initialized on this device. */
export async function getHKStatus(): Promise<"ios_only" | "unavailable" | "ready"> {
  if (Platform.OS !== "ios") return "ios_only";
  const hk = await ensureInit();
  return hk ? "ready" : "unavailable";
}

/**
 * Request HealthKit read permissions.
 * Must be called from a user-interaction context (not a background task).
 * Returns the resulting permission state (HealthKit doesn't reveal which
 * individual types were denied, so a successful init means the sheet was shown).
 */
export async function requestHKPermissions(): Promise<HKPermissions> {
  const none: HKPermissions = { heartRate: false, spo2: false, bloodPressure: false, temperature: false };
  const hk = await getHK();
  if (!hk) return none;
  // Reset flags so initHK can re-run with the permission sheet
  _initialized = false;
  _initError = false;
  const ok = await initHK(hk);
  if (ok) {
    _initialized = true;
    return { heartRate: true, spo2: true, bloodPressure: true, temperature: true };
  }
  return none;
}

/**
 * Probe current permission state without re-prompting.
 * Attempts a tiny-window read per vital; an error response means no permission.
 */
export async function getHKPermissions(): Promise<HKPermissions> {
  const none: HKPermissions = { heartRate: false, spo2: false, bloodPressure: false, temperature: false };
  const hk = await ensureInit();
  if (!hk) return none;

  const since = new Date(Date.now() - 60_000).toISOString();
  const opts: import("react-native-health").HealthInputOptions = { startDate: since };

  const probe = (
    fn: (o: import("react-native-health").HealthInputOptions, cb: (err: string, r: unknown) => void) => void
  ): Promise<boolean> =>
    new Promise((resolve) => fn(opts, (err) => resolve(!err)));

  const [hr, sp, bp, tmp] = await Promise.all([
    probe((o, cb) => hk.default.getHeartRateSamples(o, cb as any)),
    probe((o, cb) => hk.default.getOxygenSaturationSamples(o, cb as any)),
    probe((o, cb) => hk.default.getBloodPressureSamples(o, cb as any)),
    probe((o, cb) => hk.default.getBodyTemperatureSamples(o, cb as any)),
  ]);

  return { heartRate: hr, spo2: sp, bloodPressure: bp, temperature: tmp };
}

type HealthValue = import("react-native-health").HealthValue;
type BloodPressureSampleValue = import("react-native-health").BloodPressureSampleValue;

function promisifySamples<T>(
  fn: (
    opts: import("react-native-health").HealthInputOptions,
    cb: (err: string, results: T[]) => void
  ) => void,
  opts: import("react-native-health").HealthInputOptions
): Promise<T[]> {
  return new Promise((resolve) => {
    fn(opts, (err, results) => {
      if (err || !results) resolve([]);
      else resolve(results);
    });
  });
}

/**
 * Read the most recent vital signs from HealthKit for the past `hoursBack` hours.
 */
export async function readLatestVitals(hoursBack = 24): Promise<HKVitalReading> {
  const hk = await ensureInit();
  if (!hk) return {};

  const since = new Date(Date.now() - hoursBack * 3_600_000).toISOString();
  // Ask for ascending=false so index 0 is most-recent; limit to 1 sample each.
  const opts: import("react-native-health").HealthInputOptions = {
    startDate: since,
    ascending: false,
    limit: 1,
  };
  const reading: HKVitalReading = {};

  // Heart rate — bpm
  try {
    const samples = await promisifySamples<HealthValue>(
      (o, cb) => hk.default.getHeartRateSamples(o, cb),
      opts
    );
    const latest = samples[0];
    if (latest?.value != null) reading.heartRate = Math.round(latest.value);
  } catch { /* no data or no permission */ }

  // SpO2 — library returns 0–100 percentage
  try {
    const samples = await promisifySamples<HealthValue>(
      (o, cb) => hk.default.getOxygenSaturationSamples(o, cb),
      opts
    );
    const latest = samples[0];
    if (latest?.value != null) {
      reading.spo2 = Math.round(latest.value <= 1 ? latest.value * 100 : latest.value);
    }
  } catch { }

  // Blood pressure — systolic + diastolic in mmHg
  try {
    const samples = await promisifySamples<BloodPressureSampleValue>(
      (o, cb) => hk.default.getBloodPressureSamples(o, cb),
      opts
    );
    const latest = samples[0];
    if (latest?.bloodPressureSystolicValue != null && latest?.bloodPressureDiastolicValue != null) {
      reading.systolicBp = Math.round(latest.bloodPressureSystolicValue);
      reading.diastolicBp = Math.round(latest.bloodPressureDiastolicValue);
    }
  } catch { }

  // Body temperature — celsius
  try {
    const samples = await promisifySamples<HealthValue>(
      (o, cb) => hk.default.getBodyTemperatureSamples({ ...opts, unit: "celsius" } as any, cb),
      opts
    );
    const latest = samples[0];
    if (latest?.value != null) reading.temperature = parseFloat(Number(latest.value).toFixed(1));
  } catch { }

  return reading;
}

export function hasAnyReading(r: HKVitalReading): boolean {
  return r.heartRate != null || r.spo2 != null || r.systolicBp != null || r.temperature != null;
}
