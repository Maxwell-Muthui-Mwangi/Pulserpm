import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useApp } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";
import {
  HCPermissions,
  HCStatus,
  HCVitalReading,
  getHCPermissions,
  getHCStatus,
  hasAnyReading,
  readLatestVitals,
  requestHCPermissions,
} from "@/services/HealthConnectService";

type SyncState = "idle" | "reading" | "syncing" | "success" | "error" | "no_data";

interface VitalRowProps {
  icon: string;
  label: string;
  value: string | null;
  unit: string;
  permitted: boolean;
  color: string;
}

function VitalRow({ icon, label, value, unit, permitted, color }: VitalRowProps) {
  const colors = useColors();
  return (
    <View style={[vr.row, { borderBottomColor: colors.border }]}>
      <View style={[vr.iconBox, { backgroundColor: color + "18" }]}>
        <Feather name={icon as any} size={16} color={color} />
      </View>
      <Text style={[vr.label, { color: colors.foreground }]}>{label}</Text>
      {!permitted ? (
        <Text style={[vr.badge, { color: colors.mutedForeground, backgroundColor: colors.muted }]}>No permission</Text>
      ) : value != null ? (
        <Text style={[vr.value, { color }]}>{value} <Text style={[vr.unit, { color: colors.mutedForeground }]}>{unit}</Text></Text>
      ) : (
        <Text style={[vr.nodata, { color: colors.mutedForeground }]}>No data (24h)</Text>
      )}
    </View>
  );
}

const vr = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  iconBox: { width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  label: { flex: 1, fontSize: 14, fontFamily: "Inter_500Medium" },
  value: { fontSize: 15, fontFamily: "Inter_700Bold" },
  unit: { fontSize: 11, fontFamily: "Inter_400Regular" },
  badge: { fontSize: 11, fontFamily: "Inter_500Medium", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  nodata: { fontSize: 12, fontFamily: "Inter_400Regular", fontStyle: "italic" },
});

export default function HealthConnectScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { syncReading, syncFromHealthConnect, paired, lastHCSyncTime } = useApp();

  const [hcStatus, setHcStatus] = useState<HCStatus | null>(null);
  const [permissions, setPermissions] = useState<HCPermissions | null>(null);
  const [latestVitals, setLatestVitals] = useState<HCVitalReading | null>(null);
  const [syncState, setSyncState] = useState<SyncState>("idle");
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [permLoading, setPermLoading] = useState(false);
  const [bgSyncRegistered, setBgSyncRegistered] = useState<boolean | null>(null);

  useEffect(() => {
    import("@/services/BackgroundSync").then(({ isBackgroundSyncRegistered }) => {
      isBackgroundSyncRegistered().then(setBgSyncRegistered);
    });
  }, []);

  const loadStatus = useCallback(async () => {
    const status = await getHCStatus();
    setHcStatus(status);
    if (status === "ready") {
      const perms = await getHCPermissions();
      setPermissions(perms);
      if (perms.heartRate || perms.spo2 || perms.bloodPressure || perms.temperature) {
        const v = await readLatestVitals();
        setLatestVitals(v);
      }
    }
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  const handleRequestPermissions = async () => {
    setPermLoading(true);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const perms = await requestHCPermissions();
    setPermissions(perms);
    if (perms.heartRate || perms.spo2 || perms.bloodPressure || perms.temperature) {
      const v = await readLatestVitals();
      setLatestVitals(v);
      // Trigger an immediate auto-sync now that we have permissions
      syncFromHealthConnect();
    }
    setPermLoading(false);
  };

  const handleSyncNow = async () => {
    if (!paired) return;
    setSyncState("reading");
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const vitals = await readLatestVitals();
      if (!hasAnyReading(vitals)) {
        setSyncState("no_data");
        setTimeout(() => setSyncState("idle"), 3000);
        return;
      }
      setSyncState("syncing");
      const ok = await syncReading({ ...vitals, source: "health_connect" } as any);
      setSyncState(ok ? "success" : "error");
      if (ok) {
        setLastSyncTime(new Date().toISOString());
        setLatestVitals(vitals);
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    } catch {
      setSyncState("error");
    }
    setTimeout(() => setSyncState("idle"), 4000);
  };

  const s = styles(colors, insets);

  if (Platform.OS !== "android" || hcStatus === "android_only") {
    return (
      <View style={s.center}>
        <Feather name="smartphone" size={40} color={colors.mutedForeground} />
        <Text style={[s.unavailTitle, { color: colors.foreground }]}>Android Only</Text>
        <Text style={[s.unavailMsg, { color: colors.mutedForeground }]}>
          Health Connect is an Android feature. Use the Log Reading tab to enter vitals manually.
        </Text>
      </View>
    );
  }

  if (hcStatus === null) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={colors.primary} />
        <Text style={[s.unavailMsg, { color: colors.mutedForeground, marginTop: 12 }]}>Checking Health Connect…</Text>
      </View>
    );
  }

  if (hcStatus === "not_installed" || hcStatus === "not_supported") {
    return (
      <View style={s.center}>
        <Feather name="alert-circle" size={40} color={colors.warning} />
        <Text style={[s.unavailTitle, { color: colors.foreground }]}>Health Connect Not Available</Text>
        <Text style={[s.unavailMsg, { color: colors.mutedForeground }]}>
          {hcStatus === "not_installed"
            ? "Health Connect needs to be installed or updated. It's available as a free app on the Play Store."
            : "Your Android version doesn't support Health Connect (requires Android 8.0+)."}
        </Text>
      </View>
    );
  }

  if (hcStatus === "unavailable") {
    return (
      <View style={s.center}>
        <Feather name="alert-circle" size={40} color={colors.mutedForeground} />
        <Text style={[s.unavailTitle, { color: colors.foreground }]}>Not Available in Expo Go</Text>
        <Text style={[s.unavailMsg, { color: colors.mutedForeground }]}>
          Health Connect requires a development build of the PulseRPM app.{"\n\n"}
          Use the <Text style={{ fontWeight: "700" }}>Log Reading</Text> tab to enter vitals manually in the meantime.
        </Text>
      </View>
    );
  }

  const allGranted = permissions
    ? permissions.heartRate && permissions.spo2 && permissions.bloodPressure && permissions.temperature
    : false;
  const anyGranted = permissions
    ? permissions.heartRate || permissions.spo2 || permissions.bloodPressure || permissions.temperature
    : false;

  const syncBtnLabel =
    syncState === "reading" ? "Reading Health Connect…"
    : syncState === "syncing" ? "Syncing to PulseRPM…"
    : syncState === "success" ? "Synced!"
    : syncState === "error" ? "Sync failed — retry?"
    : syncState === "no_data" ? "No recent readings found"
    : "Sync Now";

  const syncBtnColor =
    syncState === "success" ? colors.success
    : syncState === "error" ? colors.destructive
    : colors.primary;

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 100 }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Status banner */}
      <View style={[s.statusBanner, { backgroundColor: anyGranted ? colors.success + "12" : colors.primary + "10", borderColor: anyGranted ? colors.success + "30" : colors.primary + "20" }]}>
        <View style={[s.statusDot, { backgroundColor: anyGranted ? colors.success : colors.mutedForeground }]} />
        <View style={{ flex: 1 }}>
          <Text style={[s.statusTitle, { color: colors.foreground }]}>
            {anyGranted ? "Health Connect Active" : "Permissions Required"}
          </Text>
          <Text style={[s.statusSub, { color: colors.mutedForeground }]}>
            {allGranted
              ? "All vitals connected — tap Sync Now to push latest readings"
              : anyGranted
              ? "Some permissions granted — grant more for complete sync"
              : "Grant Health Connect permissions to enable automatic sync"}
          </Text>
        </View>
      </View>

      {/* Vitals */}
      <Text style={[s.sectionTitle, { color: colors.mutedForeground }]}>Latest Health Connect Data (24h)</Text>
      <View style={[s.card, { backgroundColor: colors.card }]}>
        <VitalRow
          icon="heart"
          label="Heart Rate"
          value={latestVitals?.heartRate != null ? String(latestVitals.heartRate) : null}
          unit="bpm"
          permitted={permissions?.heartRate ?? false}
          color="#ef4444"
        />
        <VitalRow
          icon="droplet"
          label="Blood Oxygen (SpO₂)"
          value={latestVitals?.spo2 != null ? String(latestVitals.spo2) : null}
          unit="%"
          permitted={permissions?.spo2 ?? false}
          color="#3b82f6"
        />
        <VitalRow
          icon="bar-chart-2"
          label="Blood Pressure"
          value={latestVitals?.systolicBp != null ? `${latestVitals.systolicBp}/${latestVitals.diastolicBp}` : null}
          unit="mmHg"
          permitted={permissions?.bloodPressure ?? false}
          color="#8b5cf6"
        />
        <VitalRow
          icon="thermometer"
          label="Body Temperature"
          value={latestVitals?.temperature != null ? String(latestVitals.temperature) : null}
          unit="°C"
          permitted={permissions?.temperature ?? false}
          color="#f97316"
        />
      </View>

      {/* Permissions */}
      {!allGranted && (
        <>
          <Text style={[s.sectionTitle, { color: colors.mutedForeground }]}>Permissions</Text>
          <View style={[s.card, { backgroundColor: colors.card }]}>
            <Text style={[s.permInfo, { color: colors.mutedForeground }]}>
              PulseRPM needs read access to your Health Connect data. You can revoke access any time from the Health Connect app.
            </Text>
            <Pressable
              style={[s.permBtn, { backgroundColor: colors.primary }, permLoading && { opacity: 0.7 }]}
              onPress={handleRequestPermissions}
              disabled={permLoading}
            >
              {permLoading
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={s.permBtnText}>Grant Health Connect Permissions</Text>
              }
            </Pressable>
          </View>
        </>
      )}

      {/* Sync */}
      <Text style={[s.sectionTitle, { color: colors.mutedForeground }]}>Sync to PulseRPM</Text>
      <View style={[s.card, { backgroundColor: colors.card }]}>
        {/* Last manual sync */}
        {lastSyncTime && (
          <View style={[s.lastSyncRow, { borderBottomColor: colors.border }]}>
            <Feather name="zap" size={12} color={colors.success} />
            <Text style={[s.lastSync, { color: colors.mutedForeground }]}>
              Last manual sync: {new Date(lastSyncTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </Text>
          </View>
        )}
        {/* Last background sync */}
        {lastHCSyncTime && (
          <View style={[s.lastSyncRow, { borderBottomColor: colors.border }]}>
            <Feather name="refresh-cw" size={12} color={colors.primary} />
            <Text style={[s.lastSync, { color: colors.mutedForeground }]}>
              Last auto-sync: {new Date(lastHCSyncTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </Text>
          </View>
        )}
        <Text style={[s.syncInfo, { color: colors.mutedForeground }]}>
          Tap to read the latest 24h of vitals from Health Connect and push them to your provider dashboard immediately.
        </Text>
        <Pressable
          style={[s.syncBtn, { backgroundColor: syncBtnColor }, (!anyGranted || !paired || syncState !== "idle") && { opacity: 0.6 }]}
          onPress={handleSyncNow}
          disabled={!anyGranted || !paired || syncState !== "idle"}
        >
          {syncState === "reading" || syncState === "syncing" ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Feather name={syncState === "success" ? "check-circle" : syncState === "error" ? "alert-circle" : "zap"} size={18} color="#fff" />
          )}
          <Text style={s.syncBtnText}>{syncBtnLabel}</Text>
        </Pressable>
        {!paired && (
          <Text style={[s.warnText, { color: colors.warning }]}>⚠ Connect the app to PulseRPM first (pair screen)</Text>
        )}
      </View>

      {/* Background sync status */}
      <Text style={[s.sectionTitle, { color: colors.mutedForeground }]}>Background Auto-Sync</Text>
      <View style={[s.card, { backgroundColor: colors.card }]}>
        <View style={s.bgSyncRow}>
          <View style={[s.bgSyncDot, {
            backgroundColor: bgSyncRegistered === true
              ? colors.success
              : bgSyncRegistered === false
              ? colors.warning
              : colors.mutedForeground
          }]} />
          <View style={{ flex: 1 }}>
            <Text style={[s.bgSyncTitle, { color: colors.foreground }]}>
              {bgSyncRegistered === true
                ? "Background sync active — every 15 min"
                : bgSyncRegistered === false
                ? "Background sync pending (dev build required)"
                : "Checking status…"}
            </Text>
            <Text style={[s.bgSyncSub, { color: colors.mutedForeground }]}>
              {bgSyncRegistered === true
                ? "Vitals sync automatically even when the app is closed."
                : "Automatic background sync requires a standalone or development build of the PulseRPM app. In Expo Go, sync runs each time you open the app."}
            </Text>
          </View>
        </View>
      </View>

      {/* Flow diagram note */}
      <View style={[s.noteBox, { backgroundColor: colors.muted + "60", borderColor: colors.border }]}>
        <Feather name="info" size={14} color={colors.mutedForeground} />
        <Text style={[s.noteText, { color: colors.mutedForeground }]}>
          <Text style={{ fontWeight: "600" }}>Data flow: </Text>
          Smartwatch app → Health Connect → PulseRPM → Provider dashboard → Email alert
        </Text>
      </View>
    </ScrollView>
  );
}

function styles(colors: ReturnType<typeof useColors>, insets: ReturnType<typeof useSafeAreaInsets>) {
  return StyleSheet.create({
    scroll: { padding: 16, gap: 8, paddingTop: insets.top + 8 },
    center: {
      flex: 1, alignItems: "center", justifyContent: "center",
      paddingHorizontal: 36, gap: 12, backgroundColor: colors.background,
    },
    unavailTitle: { fontSize: 17, fontFamily: "Inter_700Bold", textAlign: "center", marginTop: 8 },
    unavailMsg: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 22 },
    statusBanner: {
      flexDirection: "row", alignItems: "flex-start", gap: 10,
      borderRadius: 12, padding: 14, borderWidth: 1, marginBottom: 8,
    },
    statusDot: { width: 10, height: 10, borderRadius: 5, marginTop: 3 },
    statusTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
    statusSub: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18, marginTop: 2 },
    sectionTitle: {
      fontSize: 11, fontFamily: "Inter_600SemiBold",
      textTransform: "uppercase", letterSpacing: 0.5,
      marginTop: 12, marginBottom: 6, paddingLeft: 4,
    },
    card: {
      borderRadius: 14, paddingHorizontal: 14, paddingVertical: 4,
      shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 }, elevation: 2,
    },
    permInfo: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 20, marginVertical: 10 },
    permBtn: {
      borderRadius: 10, paddingVertical: 13, alignItems: "center",
      justifyContent: "center", marginVertical: 8,
    },
    permBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#fff" },
    lastSyncRow: {
      flexDirection: "row" as const, alignItems: "center" as const, gap: 6,
      paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth,
    },
    lastSync: { fontSize: 12, fontFamily: "Inter_400Regular" },
    syncInfo: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 20, marginBottom: 12, marginTop: 10 },
    bgSyncRow: { flexDirection: "row" as const, alignItems: "flex-start" as const, gap: 10, paddingVertical: 14 },
    bgSyncDot: { width: 10, height: 10, borderRadius: 5, marginTop: 3 },
    bgSyncTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", marginBottom: 3 },
    bgSyncSub: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 18 },
    syncBtn: {
      flexDirection: "row", alignItems: "center", justifyContent: "center",
      gap: 8, borderRadius: 10, paddingVertical: 14, marginBottom: 8,
    },
    syncBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#fff" },
    warnText: { fontSize: 12, fontFamily: "Inter_500Medium", textAlign: "center", paddingBottom: 8 },
    noteBox: {
      flexDirection: "row", gap: 8, alignItems: "flex-start",
      borderRadius: 10, padding: 12, borderWidth: 1, marginTop: 8,
    },
    noteText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 18 },
  });
}
