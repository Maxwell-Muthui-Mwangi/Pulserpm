import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useApp } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";

function Row({ icon, iconColor, label, value, onPress, destructive }: {
  icon: string; iconColor: string; label: string; value?: string;
  onPress?: () => void; destructive?: boolean;
}) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [row.container, { borderBottomColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
    >
      <View style={[row.iconBox, { backgroundColor: iconColor + "15" }]}>
        <Feather name={icon as any} size={16} color={destructive ? colors.destructive : iconColor} />
      </View>
      <Text style={[row.label, { color: destructive ? colors.destructive : colors.foreground }]}>{label}</Text>
      {value && <Text style={[row.value, { color: colors.mutedForeground }]} numberOfLines={1}>{value}</Text>}
      {onPress && <Feather name="chevron-right" size={16} color={colors.mutedForeground} />}
    </Pressable>
  );
}

const row = StyleSheet.create({
  container: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 13, borderBottomWidth: 1 },
  iconBox: { width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  label: { flex: 1, fontSize: 14, fontFamily: "Inter_500Medium" },
  value: { fontSize: 12, fontFamily: "Inter_400Regular", maxWidth: 160 },
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const colors = useColors();
  return (
    <View style={{ gap: 0 }}>
      <Text style={[sec.title, { color: colors.mutedForeground }]}>{title}</Text>
      <View style={[sec.card, { backgroundColor: colors.card }]}>{children}</View>
    </View>
  );
}

const sec = StyleSheet.create({
  title: { fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6, paddingLeft: 4 },
  card: {
    borderRadius: 14, paddingHorizontal: 14,
    shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
});

function HealthPlatformBadge({ name, status, note }: { name: string; status: "connected" | "unavailable" | "native-only"; note: string }) {
  const colors = useColors();
  const badgeColor = status === "connected" ? colors.success : status === "native-only" ? colors.warning : colors.mutedForeground;
  const badgeLabel = status === "connected" ? "Connected" : status === "native-only" ? "APK required" : "Unavailable";
  return (
    <View style={[hp.row, { borderBottomColor: colors.border }]}>
      <View style={{ flex: 1 }}>
        <Text style={[hp.name, { color: colors.foreground }]}>{name}</Text>
        <Text style={[hp.note, { color: colors.mutedForeground }]}>{note}</Text>
      </View>
      <View style={[hp.badge, { backgroundColor: badgeColor + "15" }]}>
        <Text style={[hp.badgeText, { color: badgeColor }]}>{badgeLabel}</Text>
      </View>
    </View>
  );
}

const hp = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 12, gap: 10, borderBottomWidth: 1 },
  name: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  note: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
  badge: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
});

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { apiKey, clearApiKey, totalSynced, syncLogs } = useApp();

  const maskedKey = apiKey ? `${apiKey.slice(0, 8)}••••${apiKey.slice(-4)}` : "—";

  function confirmDisconnect() {
    if (Platform.OS === "web") {
      if (confirm("Disconnect this device? All local sync history will be cleared.")) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        clearApiKey();
      }
    } else {
      Alert.alert(
        "Disconnect Device",
        "This will remove your API key and clear all local sync history. You'll need to scan the QR code again to reconnect.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Disconnect", style: "destructive",
            onPress: () => {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
              clearApiKey();
            }
          },
        ]
      );
    }
  }

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{
        padding: 16, gap: 20,
        paddingTop: Platform.OS === "web" ? 67 + 16 : 16,
        paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 100),
      }}
    >
      <Section title="Device Pairing">
        <Row icon="key" iconColor="#0ea5e9" label="API Key" value={maskedKey} />
        <Row icon="bar-chart-2" iconColor="#22c55e" label="Total Readings Sent" value={String(totalSynced)} />
        <Row icon="clock" iconColor="#f59e0b" label="Sync History" value={`${syncLogs.length} entries`} />
      </Section>

      <Section title="Auto-Sync">
        <View style={{ paddingVertical: 14 }}>
          <Text style={{ fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular", lineHeight: 18 }}>
            The app syncs your readings immediately when you submit them. When the app is in the background, your device's OS will trigger periodic syncs of any pending readings.
          </Text>
          <View style={[{ backgroundColor: colors.accent, borderRadius: 10, padding: 12, marginTop: 12, gap: 6 }]}>
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 6 }}>
              <Feather name="smartphone" size={13} color={colors.primary} style={{ marginTop: 1 }} />
              <Text style={{ flex: 1, fontSize: 12, color: colors.accentForeground ?? colors.primary, fontFamily: "Inter_400Regular", lineHeight: 17 }}>
                <Text style={{ fontWeight: "600" }}>Android:</Text> Background sync every ~15 min (WorkManager)
              </Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 6 }}>
              <Feather name="smartphone" size={13} color={colors.primary} style={{ marginTop: 1 }} />
              <Text style={{ flex: 1, fontSize: 12, color: colors.accentForeground ?? colors.primary, fontFamily: "Inter_400Regular", lineHeight: 17 }}>
                <Text style={{ fontWeight: "600" }}>iOS:</Text> Background refresh triggered by the OS (approx. every 15–30 min based on usage)
              </Text>
            </View>
          </View>
        </View>
      </Section>

      <Section title="Health Data Sources">
        <HealthPlatformBadge
          name="Oraimo Health App"
          status="connected"
          note="Manual entry via Log tab — works right now"
        />
        <HealthPlatformBadge
          name="Google Fit / Health Connect"
          status="native-only"
          note="Auto-sync available in native Android APK build"
        />
        <HealthPlatformBadge
          name="Apple Health (HealthKit)"
          status="native-only"
          note="Auto-sync available in iOS App Store release"
        />
        <View style={{ paddingVertical: 12 }}>
          <Text style={{ fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_400Regular", lineHeight: 17 }}>
            For Oraimo: open the Oraimo Health app on your phone, check your latest readings, and enter them in the <Text style={{ fontWeight: "600", color: colors.foreground }}>Log</Text> tab. The sync takes under 30 seconds.
          </Text>
        </View>
      </Section>

      <Section title="About">
        <Row icon="shield" iconColor="#64748b" label="Data Privacy" value="End-to-end encrypted" />
        <Row icon="heart" iconColor="#ef4444" label="PulseRPM Version" value="1.0.0" />
      </Section>

      <Section title="Account">
        <Row
          icon="log-out" iconColor="#ef4444" label="Disconnect This Device"
          onPress={confirmDisconnect} destructive
        />
      </Section>
    </ScrollView>
  );
}
