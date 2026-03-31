import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SyncLog, useApp } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function VitalPill({ label, value, unit, color }: { label: string; value?: number; unit: string; color: string }) {
  const colors = useColors();
  if (value == null) return null;
  return (
    <View style={[s.pillBox, { borderColor: color + "30", backgroundColor: color + "10" }]}>
      <Text style={[s.pillValue, { color }]}>{value}</Text>
      <Text style={[s.pillUnit, { color: colors.mutedForeground }]}>{unit}</Text>
      <Text style={[s.pillLabel, { color: colors.mutedForeground }]}>{label}</Text>
    </View>
  );
}

function SyncLogRow({ log }: { log: SyncLog }) {
  const colors = useColors();
  const r = log.reading;
  const parts: string[] = [];
  if (r.heartRate) parts.push(`${r.heartRate} bpm`);
  if (r.spo2) parts.push(`SpO₂ ${r.spo2}%`);
  if (r.temperature) parts.push(`${r.temperature}°C`);
  if (r.systolicBp && r.diastolicBp) parts.push(`${r.systolicBp}/${r.diastolicBp} mmHg`);
  return (
    <View style={[s.logRow, { borderBottomColor: colors.border }]}>
      <View style={[s.logDot, { backgroundColor: log.status === "sent" ? colors.success : colors.destructive }]} />
      <View style={{ flex: 1 }}>
        <Text style={[s.logVals, { color: colors.foreground }]} numberOfLines={1}>{parts.join(" · ") || "—"}</Text>
        {log.alertsTriggered != null && log.alertsTriggered > 0 && (
          <Text style={[s.logAlert, { color: colors.warning }]}>⚠ {log.alertsTriggered} alert{log.alertsTriggered !== 1 ? "s" : ""} triggered</Text>
        )}
      </View>
      <Text style={[s.logTime, { color: colors.mutedForeground }]}>{formatTime(log.timestamp)}</Text>
    </View>
  );
}

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { paired, loading, syncStatus, lastSyncTime, syncLogs, totalSynced, pendingCount, retryPending } = useApp();

  useEffect(() => {
    if (!loading && !paired) {
      router.replace("/pair");
    }
  }, [loading, paired]);

  if (loading || !paired) {
    return (
      <View style={[s.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const lastLog = syncLogs[0];
  const lastReading = lastLog?.reading;

  const dotColor = syncStatus === "syncing" ? colors.warning : syncStatus === "error" ? colors.destructive : colors.success;

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[s.scroll, {
        paddingTop: Platform.OS === "web" ? 67 + 16 : 16,
        paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 80),
      }]}
    >
      {/* Status Card */}
      <View style={[s.card, { backgroundColor: colors.card }]}>
        <View style={s.statusRow}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={[s.dot, { backgroundColor: dotColor }]} />
            <Text style={[s.statusLabel, { color: colors.foreground }]}>
              {syncStatus === "syncing"
                ? "Syncing…"
                : syncStatus === "error"
                ? "Sync Failed"
                : syncStatus === "success"
                ? "Synced!"
                : lastSyncTime
                ? `Last sync ${timeAgo(lastSyncTime)}`
                : "Not synced yet"}
            </Text>
          </View>
          <View style={[s.badge, { backgroundColor: colors.accent }]}>
            <Text style={[s.badgeText, { color: colors.primary }]}>{totalSynced} sent</Text>
          </View>
        </View>

        {pendingCount > 0 && (
          <Pressable
            onPress={async () => { await Haptics.impactAsync(); retryPending(); }}
            style={({ pressed }) => [s.pendingRow, { backgroundColor: colors.warning + "15", opacity: pressed ? 0.75 : 1 }]}
          >
            <Feather name="upload-cloud" size={14} color={colors.warning} />
            <Text style={[s.pendingText, { color: colors.warning }]}>
              {pendingCount} reading{pendingCount !== 1 ? "s" : ""} pending — tap to retry
            </Text>
          </Pressable>
        )}
      </View>

      {/* Last Reading */}
      {lastReading && (
        <View style={[s.card, { backgroundColor: colors.card }]}>
          <Text style={[s.sectionTitle, { color: colors.mutedForeground }]}>Last Reading</Text>
          <View style={s.pillRow}>
            <VitalPill label="Heart Rate" value={lastReading.heartRate} unit="bpm" color="#ef4444" />
            <VitalPill label="SpO₂" value={lastReading.spo2} unit="%" color="#3b82f6" />
            <VitalPill label="Temp" value={lastReading.temperature} unit="°C" color="#f59e0b" />
            {lastReading.systolicBp && lastReading.diastolicBp && (
              <View style={[s.pillBox, { borderColor: "#8b5cf630", backgroundColor: "#8b5cf610" }]}>
                <Text style={[s.pillValue, { color: "#8b5cf6" }]}>{lastReading.systolicBp}/{lastReading.diastolicBp}</Text>
                <Text style={[s.pillUnit, { color: colors.mutedForeground }]}>mmHg</Text>
                <Text style={[s.pillLabel, { color: colors.mutedForeground }]}>BP</Text>
              </View>
            )}
          </View>
        </View>
      )}

      {/* Quick Log CTA */}
      <Pressable
        onPress={async () => { await Haptics.impactAsync(); router.push("/(tabs)/log"); }}
        style={({ pressed }) => [s.logCta, { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}
      >
        <Feather name="plus-circle" size={20} color="#fff" />
        <Text style={s.logCtaText}>Log a Reading</Text>
        <Feather name="chevron-right" size={18} color="rgba(255,255,255,0.7)" />
      </Pressable>

      {/* Sync Log */}
      {syncLogs.length > 0 ? (
        <View style={[s.card, { backgroundColor: colors.card }]}>
          <Text style={[s.sectionTitle, { color: colors.mutedForeground }]}>Recent Syncs</Text>
          <View style={{ marginTop: 4 }}>
            {syncLogs.slice(0, 8).map((log) => (
              <SyncLogRow key={log.id} log={log} />
            ))}
          </View>
        </View>
      ) : (
        <View style={[s.emptyCard, { backgroundColor: colors.card }]}>
          <Feather name="activity" size={32} color={colors.mutedForeground} />
          <Text style={[s.emptyTitle, { color: colors.foreground }]}>No readings yet</Text>
          <Text style={[s.emptyText, { color: colors.mutedForeground }]}>Log your first reading to start monitoring your health.</Text>
        </View>
      )}

      {/* Info Banner */}
      <View style={[s.infoBox, { backgroundColor: colors.accent, borderColor: colors.primary + "30" }]}>
        <Feather name="info" size={14} color={colors.primary} />
        <Text style={[s.infoText, { color: colors.accentForeground }]}>
          <Text style={{ fontWeight: "600" }}>Auto-sync from Google Fit / Apple Health</Text>{" "}
          will be available in the native APK build. Use the Log tab to enter readings from your Oraimo app now.
        </Text>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { padding: 16, gap: 16 },
  card: {
    borderRadius: 16, padding: 16,
    shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  statusRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  dot: { width: 10, height: 10, borderRadius: 5 },
  statusLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold", fontWeight: "600" },
  badge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold", fontWeight: "600" },
  pendingRow: {
    flexDirection: "row", alignItems: "center", gap: 6,
    borderRadius: 8, padding: 10, marginTop: 10,
  },
  pendingText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  sectionTitle: { fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5 },
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  pillBox: { borderRadius: 12, borderWidth: 1, paddingVertical: 10, paddingHorizontal: 12, alignItems: "center", minWidth: 72 },
  pillValue: { fontSize: 20, fontWeight: "700", fontFamily: "Inter_700Bold" },
  pillUnit: { fontSize: 10, fontFamily: "Inter_400Regular", marginTop: -2 },
  pillLabel: { fontSize: 10, fontFamily: "Inter_400Regular", marginTop: 2 },
  logCta: {
    borderRadius: 14, paddingVertical: 16, paddingHorizontal: 20,
    flexDirection: "row", alignItems: "center", gap: 10,
    shadowColor: "#0ea5e9", shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  logCtaText: { flex: 1, color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold", fontWeight: "600" },
  logRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderBottomWidth: 1 },
  logDot: { width: 8, height: 8, borderRadius: 4 },
  logVals: { fontSize: 13, fontFamily: "Inter_500Medium" },
  logAlert: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
  logTime: { fontSize: 11, fontFamily: "Inter_400Regular" },
  emptyCard: {
    borderRadius: 16, padding: 32, alignItems: "center", gap: 8,
    shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  emptyTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", fontWeight: "600" },
  emptyText: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },
  infoBox: { borderRadius: 12, borderWidth: 1, padding: 12, flexDirection: "row", gap: 8 },
  infoText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 18 },
});
