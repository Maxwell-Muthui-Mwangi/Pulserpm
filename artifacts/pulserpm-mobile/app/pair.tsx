import { Feather } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useApp } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";

const DOMAIN = process.env.EXPO_PUBLIC_DOMAIN ?? "";

async function validateApiKey(key: string): Promise<{ valid: boolean; patientName?: string }> {
  try {
    const url = DOMAIN
      ? `https://${DOMAIN}/api/device/status`
      : "/api/device/status";
    const res = await fetch(url, {
      headers: { "X-Device-Api-Key": key },
    });
    const data = await res.json();
    return { valid: !!data.valid, patientName: data.patientName };
  } catch {
    return { valid: false };
  }
}

export default function PairScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { setApiKey } = useApp();
  const [permission, requestPermission] = useCameraPermissions();
  const [mode, setMode] = useState<"choose" | "camera" | "manual">("choose");
  const [manualKey, setManualKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const scanned = useRef(false);

  async function connectWithKey(key: string) {
    setSaving(true);
    setError("");
    const { valid, patientName } = await validateApiKey(key);
    if (!valid) {
      setSaving(false);
      setError("Invalid API key. Please check and try again, or generate a new QR code from the dashboard.");
      return;
    }
    await setApiKey(key);
    setSaving(false);
    console.log(`[pair] Connected as ${patientName ?? "patient"}`);
    router.replace("/(tabs)");
  }

  async function handleQrScan({ data }: { data: string }) {
    if (scanned.current || saving) return;
    scanned.current = true;
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    let key: string | null = null;
    try {
      const url = new URL(data);
      key = url.searchParams.get("apiKey");
    } catch {
      try {
        const parsed = JSON.parse(data);
        key = parsed.apiKey ?? null;
      } catch {
        key = null;
      }
    }
    if (key) {
      setMode("choose");
      await connectWithKey(key);
      if (saving === false) scanned.current = false;
    } else {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError("QR code not recognized. Try entering the API key manually.");
      setMode("choose");
      scanned.current = false;
    }
  }

  async function handleManualSave() {
    const key = manualKey.trim();
    if (!key) { setError("Please enter your API key."); return; }
    await connectWithKey(key);
  }

  async function openCamera() {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        setError("Camera permission is required to scan QR codes.");
        return;
      }
    }
    scanned.current = false;
    setMode("camera");
  }

  const s = styles(colors, insets);

  if (mode === "camera") {
    return (
      <View style={s.cameraContainer}>
        <CameraView
          style={StyleSheet.absoluteFill}
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          onBarcodeScanned={handleQrScan}
        />
        {saving && (
          <View style={s.cameraValidating}>
            <ActivityIndicator color="#fff" size="large" />
            <Text style={s.cameraValidatingText}>Validating key…</Text>
          </View>
        )}
        <View style={s.cameraOverlay}>
          <View style={[s.cameraCornerBox, { marginTop: insets.top + 20 }]}>
            <View style={[s.corner, s.cornerTL]} />
            <View style={[s.corner, s.cornerTR]} />
            <View style={[s.corner, s.cornerBL]} />
            <View style={[s.corner, s.cornerBR]} />
          </View>
          <Text style={s.cameraTip}>Point at the QR code in PulseRPM</Text>
          <Pressable onPress={() => { setMode("choose"); scanned.current = false; }} style={s.cancelBtn}>
            <Text style={s.cancelBtnText}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <View style={s.logoRow}>
          <View style={s.logoCircle}>
            <Feather name="activity" size={32} color="#fff" />
          </View>
          <Text style={s.logoTitle}>PulseRPM</Text>
          <Text style={s.logoSub}>Remote Patient Monitor</Text>
        </View>

        <View style={s.card}>
          <Text style={s.cardTitle}>Connect Your Account</Text>
          <Text style={s.cardDesc}>
            Scan the QR code from your PulseRPM profile to link this device and enable automatic health sync.
          </Text>

          {mode === "choose" && (
            <View style={s.btnGroup}>
              <Pressable onPress={openCamera} disabled={saving} style={({ pressed }) => [s.primaryBtn, pressed && s.pressed]}>
                {saving ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Feather name="camera" size={20} color="#fff" />
                    <Text style={s.primaryBtnText}>Scan QR Code</Text>
                  </>
                )}
              </Pressable>
              <Pressable onPress={() => { setMode("manual"); setError(""); }} style={({ pressed }) => [s.ghostBtn, pressed && s.pressed]}>
                <Text style={s.ghostBtnText}>Enter API Key Manually</Text>
              </Pressable>
            </View>
          )}

          {mode === "manual" && (
            <View style={s.manualSection}>
              <Text style={s.fieldLabel}>API Key</Text>
              <TextInput
                style={s.input}
                value={manualKey}
                onChangeText={setManualKey}
                placeholder="Paste your API key here"
                placeholderTextColor={colors.mutedForeground}
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
              />
              <Pressable onPress={handleManualSave} disabled={saving} style={({ pressed }) => [s.primaryBtn, pressed && s.pressed]}>
                {saving ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={s.primaryBtnText}>Connect</Text>
                )}
              </Pressable>
              <Pressable onPress={() => { setMode("choose"); setError(""); }} style={[s.ghostBtn, { marginTop: 4 }]}>
                <Text style={s.ghostBtnText}>Back</Text>
              </Pressable>
            </View>
          )}

          {!!error && (
            <View style={s.errorBox}>
              <Feather name="alert-circle" size={14} color="#ef4444" />
              <Text style={s.errorText}>{error}</Text>
            </View>
          )}
        </View>

        <View style={s.howCard}>
          <Text style={s.howTitle}>How to get your QR code</Text>
          {[
            "Sign in to PulseRPM on your desktop",
            "Go to My Profile → Connect Device tab",
            'Tap "Generate QR Code"',
            "Scan with this app — done!",
          ].map((step, i) => (
            <View key={i} style={s.howStep}>
              <View style={s.howBullet}><Text style={s.howBulletText}>{i + 1}</Text></View>
              <Text style={s.howStepText}>{step}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function styles(colors: ReturnType<typeof useColors>, insets: { top: number; bottom: number }) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: colors.background },
    scroll: {
      flexGrow: 1,
      padding: 20,
      paddingTop: insets.top + (Platform.OS === "web" ? 67 : 20),
      paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 20),
      gap: 16,
    },
    logoRow: { alignItems: "center", paddingVertical: 24, gap: 8 },
    logoCircle: {
      width: 64, height: 64, borderRadius: 16,
      backgroundColor: colors.primary,
      alignItems: "center", justifyContent: "center",
      shadowColor: colors.primary, shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
      elevation: 4,
    },
    logoTitle: { fontSize: 24, fontWeight: "700", color: colors.foreground, fontFamily: "Inter_700Bold" },
    logoSub: { fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
    card: {
      backgroundColor: colors.card, borderRadius: colors.radius,
      padding: 20, gap: 12,
      shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
      elevation: 2,
    },
    cardTitle: { fontSize: 18, fontWeight: "700", color: colors.foreground, fontFamily: "Inter_700Bold" },
    cardDesc: { fontSize: 14, color: colors.mutedForeground, lineHeight: 20, fontFamily: "Inter_400Regular" },
    btnGroup: { gap: 10, marginTop: 4 },
    primaryBtn: {
      backgroundColor: colors.primary, borderRadius: colors.radius,
      paddingVertical: 14, paddingHorizontal: 20,
      flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    },
    primaryBtnText: { color: "#fff", fontSize: 15, fontWeight: "600", fontFamily: "Inter_600SemiBold" },
    ghostBtn: {
      borderRadius: colors.radius, paddingVertical: 12,
      alignItems: "center", justifyContent: "center",
    },
    ghostBtnText: { color: colors.primary, fontSize: 14, fontWeight: "500", fontFamily: "Inter_500Medium" },
    pressed: { opacity: 0.75 },
    manualSection: { gap: 10, marginTop: 4 },
    fieldLabel: { fontSize: 12, fontWeight: "600", color: colors.mutedForeground, textTransform: "uppercase", letterSpacing: 0.5, fontFamily: "Inter_600SemiBold" },
    input: {
      backgroundColor: colors.secondary, borderRadius: 8,
      paddingHorizontal: 14, paddingVertical: 12,
      fontSize: 14, color: colors.foreground, fontFamily: "Inter_400Regular",
      borderWidth: 1, borderColor: colors.border,
    },
    errorBox: {
      flexDirection: "row", alignItems: "flex-start", gap: 6,
      backgroundColor: "#fef2f2", borderRadius: 8, padding: 10, marginTop: 4,
    },
    errorText: { flex: 1, fontSize: 13, color: "#ef4444", fontFamily: "Inter_400Regular", lineHeight: 18 },
    howCard: {
      backgroundColor: colors.card, borderRadius: colors.radius,
      padding: 20, gap: 12,
      shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 1 },
      elevation: 1,
    },
    howTitle: { fontSize: 13, fontWeight: "600", color: colors.mutedForeground, textTransform: "uppercase", letterSpacing: 0.5, fontFamily: "Inter_600SemiBold" },
    howStep: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
    howBullet: {
      width: 22, height: 22, borderRadius: 11,
      backgroundColor: colors.accent, alignItems: "center", justifyContent: "center",
    },
    howBulletText: { fontSize: 11, fontWeight: "700", color: colors.primary, fontFamily: "Inter_700Bold" },
    howStepText: { flex: 1, fontSize: 14, color: colors.foreground, lineHeight: 20, fontFamily: "Inter_400Regular" },
    cameraContainer: { flex: 1, backgroundColor: "#000" },
    cameraValidating: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "rgba(0,0,0,0.6)",
      alignItems: "center",
      justifyContent: "center",
      gap: 12,
      zIndex: 10,
    },
    cameraValidatingText: { color: "#fff", fontSize: 16, fontFamily: "Inter_500Medium" },
    cameraOverlay: {
      ...StyleSheet.absoluteFillObject,
      alignItems: "center",
      justifyContent: "space-between",
      paddingBottom: 60,
    },
    cameraCornerBox: {
      width: 240, height: 240,
      position: "relative",
    },
    corner: { position: "absolute", width: 28, height: 28, borderColor: "#fff", borderWidth: 3 },
    cornerTL: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 8 },
    cornerTR: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 8 },
    cornerBL: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 8 },
    cornerBR: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 8 },
    cameraTip: { color: "#fff", fontSize: 15, fontFamily: "Inter_500Medium", textAlign: "center" },
    cancelBtn: { backgroundColor: "rgba(255,255,255,0.15)", paddingHorizontal: 28, paddingVertical: 12, borderRadius: 50 },
    cancelBtnText: { color: "#fff", fontSize: 15, fontWeight: "600", fontFamily: "Inter_600SemiBold" },
  });
}
