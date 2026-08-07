/**
 * BackgroundSync — periodic Health Connect auto-sync via expo-background-fetch.
 *
 * IMPORTANT: TaskManager.defineTask MUST run at module level before any React
 * rendering. This file must be imported in _layout.tsx before the Stack renders.
 *
 * Works in development builds and standalone APKs.
 * Silently no-ops in Expo Go (BackgroundFetch registration throws, we catch it).
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as BackgroundFetch from "expo-background-fetch";
import * as TaskManager from "expo-task-manager";
import { Platform } from "react-native";

export const HC_SYNC_TASK = "pulserpm-hc-background-sync";

const STORAGE_KEY_API        = "pulserpm_api_key";
const STORAGE_KEY_INGEST_URL = "pulserpm_ingest_url";   // saved at pair-time
export const STORAGE_KEY_LAST_HC_SYNC    = "pulserpm_last_hc_sync";
export const STORAGE_KEY_BG_SYNC_ENABLED = "pulserpm_bg_sync_enabled";

/**
 * Post vitals to the API.
 * Reads the ingest URL that was saved at pair-time (from /device/connect response)
 * so background syncs always reach the same environment as the foreground app.
 * Falls back to the build-time EXPO_PUBLIC_DOMAIN if no URL has been stored yet.
 */
async function postVitals(apiKey: string, vitals: Record<string, number | string>): Promise<boolean> {
  const storedUrl = await AsyncStorage.getItem(STORAGE_KEY_INGEST_URL);
  const fallbackDomain = process.env.EXPO_PUBLIC_DOMAIN ?? "";
  const ingestUrl = storedUrl || (fallbackDomain ? `https://${fallbackDomain}/api/device/ingest` : "");
  if (!ingestUrl) return false;

  try {
    const res = await fetch(ingestUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Device-Api-Key": apiKey,
      },
      body: JSON.stringify({ source: "health_connect", ...vitals }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Task definition MUST be at module scope (not inside any component or hook)
TaskManager.defineTask(HC_SYNC_TASK, async () => {
  if (Platform.OS !== "android") {
    return BackgroundFetch.BackgroundFetchResult.NoData;
  }

  try {
    const apiKey = await AsyncStorage.getItem(STORAGE_KEY_API);
    if (!apiKey) return BackgroundFetch.BackgroundFetchResult.NoData;

    const { getHCStatus, getHCPermissions, readLatestVitals, hasAnyReading } = await import(
      "./HealthConnectService"
    );

    const status = await getHCStatus();
    if (status !== "ready") return BackgroundFetch.BackgroundFetchResult.NoData;

    const perms = await getHCPermissions();
    if (!perms.heartRate && !perms.spo2 && !perms.bloodPressure && !perms.temperature) {
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    // Read vitals since the last successful sync (or last 2 hours if never synced)
    const lastSyncRaw = await AsyncStorage.getItem(STORAGE_KEY_LAST_HC_SYNC);
    let hoursBack = 2;
    if (lastSyncRaw) {
      const msSince = Date.now() - new Date(lastSyncRaw).getTime();
      hoursBack = Math.min(Math.max(msSince / 3_600_000 + 0.1, 0.25), 24);
    }
    const vitals = await readLatestVitals(hoursBack);
    if (!hasAnyReading(vitals)) return BackgroundFetch.BackgroundFetchResult.NoData;

    const payload: Record<string, number | string> = {};
    if (vitals.heartRate != null) payload.heartRate = vitals.heartRate;
    if (vitals.spo2 != null) payload.spo2 = vitals.spo2;
    if (vitals.temperature != null) payload.temperature = vitals.temperature;
    if (vitals.systolicBp != null) payload.systolicBp = vitals.systolicBp;
    if (vitals.diastolicBp != null) payload.diastolicBp = vitals.diastolicBp;

    const ok = await postVitals(apiKey, payload);
    if (ok) {
      await AsyncStorage.setItem(STORAGE_KEY_LAST_HC_SYNC, new Date().toISOString());
      return BackgroundFetch.BackgroundFetchResult.NewData;
    }
    return BackgroundFetch.BackgroundFetchResult.Failed;
  } catch {
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

export async function registerBackgroundSync(intervalMinutes = 15): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  try {
    await BackgroundFetch.registerTaskAsync(HC_SYNC_TASK, {
      minimumInterval: intervalMinutes * 60,
      stopOnTerminate: false,
      startOnBoot: true,
    });
    await AsyncStorage.setItem(STORAGE_KEY_BG_SYNC_ENABLED, "true");
    return true;
  } catch {
    // BackgroundFetch throws in Expo Go — silently ignore
    return false;
  }
}

export async function unregisterBackgroundSync(): Promise<void> {
  try {
    await BackgroundFetch.unregisterTaskAsync(HC_SYNC_TASK);
  } catch { }
  await AsyncStorage.removeItem(STORAGE_KEY_BG_SYNC_ENABLED);
}

export async function isBackgroundSyncRegistered(): Promise<boolean> {
  try {
    const tasks = await TaskManager.getRegisteredTasksAsync();
    return tasks.some((t) => t.taskName === HC_SYNC_TASK);
  } catch {
    return false;
  }
}

export async function getLastHCSyncTime(): Promise<string | null> {
  return AsyncStorage.getItem(STORAGE_KEY_LAST_HC_SYNC);
}
