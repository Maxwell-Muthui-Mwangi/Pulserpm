import { Platform } from "react-native";

export type HCStatus =
  | "android_only"
  | "unavailable"
  | "not_installed"
  | "not_supported"
  | "ready";

export interface HCVitalReading {
  heartRate?: number;
  spo2?: number;
  systolicBp?: number;
  diastolicBp?: number;
  temperature?: number;
}

export interface HCPermissions {
  heartRate: boolean;
  spo2: boolean;
  bloodPressure: boolean;
  temperature: boolean;
}

type HC = typeof import("react-native-health-connect");
let _hc: HC | null = null;
let _initialized = false;

async function getHC(): Promise<HC | null> {
  if (Platform.OS !== "android") return null;
  if (_hc) return _hc;
  try {
    const mod = await import("react-native-health-connect");
    _hc = mod;
    return _hc;
  } catch {
    return null;
  }
}

async function ensureInit(): Promise<HC | null> {
  const hc = await getHC();
  if (!hc) return null;
  if (!_initialized) {
    try {
      await hc.initialize();
      _initialized = true;
    } catch {
      return null;
    }
  }
  return hc;
}

export async function getHCStatus(): Promise<HCStatus> {
  if (Platform.OS !== "android") return "android_only";
  const hc = await getHC();
  if (!hc) return "unavailable";
  try {
    const { getSdkStatus, SdkAvailabilityStatus } = hc;
    const status = await getSdkStatus();
    if (status === SdkAvailabilityStatus.SDK_AVAILABLE) return "ready";
    if (
      status ===
      SdkAvailabilityStatus.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED
    )
      return "not_installed";
    return "not_supported";
  } catch {
    return "unavailable";
  }
}

export async function requestHCPermissions(): Promise<HCPermissions> {
  const hc = await ensureInit();
  if (!hc) return { heartRate: false, spo2: false, bloodPressure: false, temperature: false };
  try {
    const granted = await hc.requestPermission([
      { accessType: "read", recordType: "HeartRate" },
      { accessType: "read", recordType: "OxygenSaturation" },
      { accessType: "read", recordType: "BloodPressure" },
      { accessType: "read", recordType: "BodyTemperature" },
    ]);
    const types = granted.map((p: { recordType: string }) => p.recordType);
    return {
      heartRate: types.includes("HeartRate"),
      spo2: types.includes("OxygenSaturation"),
      bloodPressure: types.includes("BloodPressure"),
      temperature: types.includes("BodyTemperature"),
    };
  } catch {
    return { heartRate: false, spo2: false, bloodPressure: false, temperature: false };
  }
}

export async function getHCPermissions(): Promise<HCPermissions> {
  const hc = await ensureInit();
  if (!hc) return { heartRate: false, spo2: false, bloodPressure: false, temperature: false };
  try {
    const granted = await hc.getGrantedPermissions();
    const types = (granted as { recordType: string }[]).map((p) => p.recordType);
    return {
      heartRate: types.includes("HeartRate"),
      spo2: types.includes("OxygenSaturation"),
      bloodPressure: types.includes("BloodPressure"),
      temperature: types.includes("BodyTemperature"),
    };
  } catch {
    return { heartRate: false, spo2: false, bloodPressure: false, temperature: false };
  }
}

export async function readLatestVitals(hoursBack = 24): Promise<HCVitalReading> {
  const hc = await ensureInit();
  if (!hc) return {};
  const { readRecords } = hc;

  const now = new Date();
  const from = new Date(now.getTime() - hoursBack * 3600 * 1000);
  const timeRangeFilter = {
    operator: "between" as const,
    startTime: from.toISOString(),
    endTime: now.toISOString(),
  };

  const reading: HCVitalReading = {};

  try {
    const { records } = await readRecords("HeartRate", { timeRangeFilter, ascendingOrder: false, pageSize: 5 });
    const last = records[0] as any;
    if (last?.samples?.length) {
      reading.heartRate = Math.round(last.samples[last.samples.length - 1].beatsPerMinute);
    }
  } catch { /* permission not granted or no data */ }

  try {
    const { records } = await readRecords("OxygenSaturation", { timeRangeFilter, ascendingOrder: false, pageSize: 5 });
    const last = records[0] as any;
    if (last != null) {
      const raw = last.percentage ?? last.percentage;
      if (raw != null) reading.spo2 = Math.round(raw <= 1 ? raw * 100 : raw);
    }
  } catch { }

  try {
    const { records } = await readRecords("BloodPressure", { timeRangeFilter, ascendingOrder: false, pageSize: 5 });
    const last = records[0] as any;
    if (last != null) {
      const sys = last.systolic?.inMillimetersOfMercury ?? last.systolic;
      const dia = last.diastolic?.inMillimetersOfMercury ?? last.diastolic;
      if (sys != null && dia != null) {
        reading.systolicBp = Math.round(sys);
        reading.diastolicBp = Math.round(dia);
      }
    }
  } catch { }

  try {
    const { records } = await readRecords("BodyTemperature", { timeRangeFilter, ascendingOrder: false, pageSize: 5 });
    const last = records[0] as any;
    if (last != null) {
      const temp = last.temperature?.inCelsius ?? last.temperature;
      if (temp != null) reading.temperature = parseFloat(Number(temp).toFixed(1));
    }
  } catch { }

  return reading;
}

export function hasAnyReading(r: HCVitalReading): boolean {
  return (
    r.heartRate != null ||
    r.spo2 != null ||
    r.systolicBp != null ||
    r.temperature != null
  );
}
