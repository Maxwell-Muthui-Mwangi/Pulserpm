import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AppState as RNAppState, AppStateStatus, Platform } from "react-native";

import { STORAGE_KEY_LAST_HC_SYNC, registerBackgroundSync } from "@/services/BackgroundSync";

const DOMAIN = process.env.EXPO_PUBLIC_DOMAIN ?? "";
const INGEST_URL = `https://${DOMAIN}/api/device/ingest`;

const STORAGE_KEY_API = "pulserpm_api_key";
const STORAGE_KEY_LOGS = "pulserpm_sync_logs";
const STORAGE_KEY_PENDING = "pulserpm_pending";
const STORAGE_KEY_TOTAL = "pulserpm_total_synced";

export interface VitalReading {
  heartRate?: number;
  spo2?: number;
  temperature?: number;
  systolicBp?: number;
  diastolicBp?: number;
  /** Which device/source produced this reading — passed through to backend */
  source?: string;
}

export interface SyncLog {
  id: string;
  timestamp: string;
  status: "sent" | "failed";
  reading: VitalReading;
  source?: string;
  alertsTriggered?: number;
}

interface AppContextType {
  apiKey: string | null;
  loading: boolean;
  paired: boolean;
  syncStatus: "idle" | "syncing" | "success" | "error";
  lastSyncTime: string | null;
  lastHCSyncTime: string | null;
  syncLogs: SyncLog[];
  totalSynced: number;
  pendingCount: number;
  setApiKey: (key: string) => Promise<void>;
  clearApiKey: () => Promise<void>;
  syncReading: (reading: VitalReading) => Promise<boolean>;
  retryPending: () => Promise<void>;
  syncFromHealthConnect: () => Promise<void>;
}

const AppContext = createContext<AppContextType>({} as AppContextType);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [apiKey, setApiKeyState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "success" | "error">("idle");
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [lastHCSyncTime, setLastHCSyncTime] = useState<string | null>(null);
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);
  const [totalSynced, setTotalSynced] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const appState = useRef<AppStateStatus>(RNAppState.currentState);
  const hcSyncing = useRef(false);

  useEffect(() => {
    loadStoredState();
  }, []);

  async function loadStoredState() {
    try {
      const [key, logsJson, totalStr, pendingJson, lastHC] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEY_API),
        AsyncStorage.getItem(STORAGE_KEY_LOGS),
        AsyncStorage.getItem(STORAGE_KEY_TOTAL),
        AsyncStorage.getItem(STORAGE_KEY_PENDING),
        AsyncStorage.getItem(STORAGE_KEY_LAST_HC_SYNC),
      ]);
      if (key) setApiKeyState(key);
      if (logsJson) {
        const logs: SyncLog[] = JSON.parse(logsJson);
        setSyncLogs(logs.slice(0, 50));
        const last = logs.find((l) => l.status === "sent");
        if (last) setLastSyncTime(last.timestamp);
      }
      if (totalStr) setTotalSynced(parseInt(totalStr, 10) || 0);
      if (pendingJson) {
        const pending: VitalReading[] = JSON.parse(pendingJson);
        setPendingCount(pending.length);
      }
      if (lastHC) setLastHCSyncTime(lastHC);
    } catch (_) {}
    setLoading(false);
  }

  async function setApiKey(key: string) {
    await AsyncStorage.setItem(STORAGE_KEY_API, key);
    setApiKeyState(key);
  }

  async function clearApiKey() {
    await Promise.all([
      AsyncStorage.removeItem(STORAGE_KEY_API),
      AsyncStorage.removeItem(STORAGE_KEY_LOGS),
      AsyncStorage.removeItem(STORAGE_KEY_PENDING),
      AsyncStorage.removeItem(STORAGE_KEY_TOTAL),
    ]);
    setApiKeyState(null);
    setSyncLogs([]);
    setLastSyncTime(null);
    setTotalSynced(0);
    setPendingCount(0);
    setSyncStatus("idle");
  }

  async function postReading(
    key: string,
    reading: VitalReading
  ): Promise<{ ok: boolean; alertsTriggered?: number }> {
    // Use the reading's source field; fall back to "mobile" if not specified
    const payload: Record<string, number | string> = {
      source: reading.source ?? "mobile",
    };
    if (reading.heartRate != null) payload.heartRate = reading.heartRate;
    if (reading.spo2 != null) payload.spo2 = reading.spo2;
    if (reading.temperature != null) payload.temperature = reading.temperature;
    if (reading.systolicBp != null) payload.systolicBp = reading.systolicBp;
    if (reading.diastolicBp != null) payload.diastolicBp = reading.diastolicBp;

    const res = await fetch(INGEST_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Device-Api-Key": key },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return { ok: false };
    const data = await res.json().catch(() => ({}));
    return { ok: true, alertsTriggered: data.alertsTriggered };
  }

  async function addLog(log: SyncLog) {
    setSyncLogs((prev) => {
      const updated = [log, ...prev].slice(0, 50);
      AsyncStorage.setItem(STORAGE_KEY_LOGS, JSON.stringify(updated)).catch(() => {});
      return updated;
    });
    if (log.status === "sent") {
      setLastSyncTime(log.timestamp);
      setTotalSynced((prev) => {
        const next = prev + 1;
        AsyncStorage.setItem(STORAGE_KEY_TOTAL, String(next)).catch(() => {});
        return next;
      });
    }
  }

  async function addToPending(reading: VitalReading) {
    const pendingJson = await AsyncStorage.getItem(STORAGE_KEY_PENDING);
    const pending: VitalReading[] = pendingJson ? JSON.parse(pendingJson) : [];
    pending.push(reading);
    await AsyncStorage.setItem(STORAGE_KEY_PENDING, JSON.stringify(pending));
    setPendingCount(pending.length);
  }

  const syncReading = useCallback(
    async (reading: VitalReading): Promise<boolean> => {
      if (!apiKey) return false;
      setSyncStatus("syncing");
      const now = new Date().toISOString();
      try {
        const { ok, alertsTriggered } = await postReading(apiKey, reading);
        const log: SyncLog = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          timestamp: now,
          status: ok ? "sent" : "failed",
          reading,
          source: reading.source,
          alertsTriggered,
        };
        await addLog(log);
        setSyncStatus(ok ? "success" : "error");
        if (!ok) await addToPending(reading);
        setTimeout(() => setSyncStatus("idle"), 3000);
        return ok;
      } catch {
        const log: SyncLog = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          timestamp: now,
          status: "failed",
          reading,
          source: reading.source,
        };
        await addLog(log);
        await addToPending(reading);
        setSyncStatus("error");
        setTimeout(() => setSyncStatus("idle"), 3000);
        return false;
      }
    },
    [apiKey]
  );

  const retryPending = useCallback(async () => {
    if (!apiKey) return;
    const pendingJson = await AsyncStorage.getItem(STORAGE_KEY_PENDING);
    if (!pendingJson) return;
    const pending: VitalReading[] = JSON.parse(pendingJson);
    if (pending.length === 0) return;
    setSyncStatus("syncing");
    const remaining: VitalReading[] = [];
    for (const reading of pending) {
      try {
        const { ok } = await postReading(apiKey, reading);
        if (!ok) remaining.push(reading);
        else {
          await addLog({
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            timestamp: new Date().toISOString(),
            status: "sent",
            reading,
            source: reading.source,
          });
        }
      } catch {
        remaining.push(reading);
      }
    }
    await AsyncStorage.setItem(STORAGE_KEY_PENDING, JSON.stringify(remaining));
    setPendingCount(remaining.length);
    setSyncStatus(remaining.length === 0 ? "success" : "error");
    setTimeout(() => setSyncStatus("idle"), 3000);
  }, [apiKey]);

  /**
   * Reads the latest Health Connect vitals (last 30 min) and syncs them.
   * Called automatically on foreground wake and exposed for manual use.
   * Silently exits on iOS or when HC is unavailable (Expo Go).
   */
  const syncFromHealthConnect = useCallback(async () => {
    if (Platform.OS !== "android" || !apiKey || hcSyncing.current) return;
    hcSyncing.current = true;
    try {
      const { getHCStatus, getHCPermissions, readLatestVitals, hasAnyReading } = await import(
        "@/services/HealthConnectService"
      );
      const status = await getHCStatus();
      if (status !== "ready") return;
      const perms = await getHCPermissions();
      if (!perms.heartRate && !perms.spo2 && !perms.bloodPressure && !perms.temperature) return;

      const vitals = await readLatestVitals(0.5); // last 30 minutes
      if (!hasAnyReading(vitals)) return;

      const ok = await syncReading({ ...vitals, source: "health_connect" });
      if (ok) {
        const ts = new Date().toISOString();
        await AsyncStorage.setItem(STORAGE_KEY_LAST_HC_SYNC, ts);
        setLastHCSyncTime(ts);
      }
    } catch {
      // HC unavailable in Expo Go — silent
    } finally {
      hcSyncing.current = false;
    }
  }, [apiKey, syncReading]);

  // Register background sync and run an initial HC sync when the key is set
  useEffect(() => {
    if (!apiKey) return;
    registerBackgroundSync(15);
    syncFromHealthConnect();
  }, [apiKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // On foreground wake: retry failed uploads + pull fresh HC data
  useEffect(() => {
    if (!apiKey) return;
    const sub = RNAppState.addEventListener("change", (next: AppStateStatus) => {
      if (appState.current.match(/inactive|background/) && next === "active") {
        retryPending();
        syncFromHealthConnect();
      }
      appState.current = next;
    });
    return () => sub.remove();
  }, [apiKey, retryPending, syncFromHealthConnect]);

  return (
    <AppContext.Provider
      value={{
        apiKey,
        loading,
        paired: !!apiKey,
        syncStatus,
        lastSyncTime,
        lastHCSyncTime,
        syncLogs,
        totalSynced,
        pendingCount,
        setApiKey,
        clearApiKey,
        syncReading,
        retryPending,
        syncFromHealthConnect,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  return useContext(AppContext);
}
