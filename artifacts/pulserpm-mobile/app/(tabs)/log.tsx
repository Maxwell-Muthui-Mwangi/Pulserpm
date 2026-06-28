import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { VitalReading, useApp } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";

interface FieldState { value: string; skipped: boolean }

function VitalInput({
  label, unit, icon, iconColor, placeholder, hint,
  state, onChange, hasError,
}: {
  label: string; unit: string; icon: string; iconColor: string;
  placeholder: string; hint: string;
  state: FieldState;
  onChange: (v: string) => void;
  hasError?: boolean;
}) {
  const colors = useColors();
  const s = fieldStyles(colors);
  return (
    <View style={[s.card, hasError && { borderWidth: 1, borderColor: "#ef4444" }]}>
      <View style={s.header}>
        <View style={[s.iconBox, { backgroundColor: iconColor + "15" }]}>
          <Feather name={icon as any} size={16} color={iconColor} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.label}>{label}</Text>
          <Text style={s.unit}>{unit}</Text>
        </View>
        <View style={[s.requiredBadge, { backgroundColor: iconColor + "15" }]}>
          <Text style={[s.requiredText, { color: iconColor }]}>Required</Text>
        </View>
      </View>
      <View style={{ marginTop: 10 }}>
        <TextInput
          style={s.input}
          value={state.value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={colors.mutedForeground}
          keyboardType="decimal-pad"
        />
        <Text style={s.hint}>{hint}</Text>
      </View>
    </View>
  );
}

function fieldStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.card, borderRadius: 14, padding: 14,
      shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 1 },
      elevation: 1,
    },
    header: { flexDirection: "row", alignItems: "center", gap: 10 },
    iconBox: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center" },
    label: { fontSize: 14, fontWeight: "600", color: colors.foreground, fontFamily: "Inter_600SemiBold" },
    unit: { fontSize: 11, color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
    requiredBadge: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
    requiredText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
    input: {
      backgroundColor: colors.secondary, borderRadius: 10,
      paddingHorizontal: 14, paddingVertical: 12,
      fontSize: 22, fontFamily: "Inter_700Bold", color: colors.foreground, fontWeight: "700",
      textAlign: "center", letterSpacing: 2,
    },
    hint: { fontSize: 11, color: colors.mutedForeground, marginTop: 6, textAlign: "center", fontFamily: "Inter_400Regular" },
  });
}

const EMPTY: FieldState = { value: "", skipped: false };

export default function LogScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { syncReading, syncStatus, paired } = useApp();

  const [heartRate, setHeartRate] = useState<FieldState>(EMPTY);
  const [spo2, setSpo2] = useState<FieldState>(EMPTY);
  const [temp, setTemp] = useState<FieldState>(EMPTY);
  const [systolic, setSystolic] = useState("");
  const [diastolic, setDiastolic] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, boolean>>({});
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const loading = syncStatus === "syncing";

  function reset() {
    setHeartRate(EMPTY);
    setSpo2(EMPTY);
    setTemp(EMPTY);
    setSystolic("");
    setDiastolic("");
    setFieldErrors({});
    setError("");
    setSubmitted(false);
  }

  async function handleSubmit() {
    setError("");
    const errs: Record<string, boolean> = {};
    const reading: VitalReading = {};

    // Heart Rate — required
    if (!heartRate.value.trim()) {
      errs.heartRate = true;
    } else {
      const v = Number(heartRate.value);
      if (isNaN(v) || v < 30 || v > 250) { setError("Heart rate must be 30–250 bpm."); errs.heartRate = true; setFieldErrors(errs); return; }
      reading.heartRate = Math.round(v);
    }

    // SpO₂ — required
    if (!spo2.value.trim()) {
      errs.spo2 = true;
    } else {
      const v = Number(spo2.value);
      if (isNaN(v) || v < 50 || v > 100) { setError("SpO₂ must be 50–100%."); errs.spo2 = true; setFieldErrors(errs); return; }
      reading.spo2 = Math.round(v);
    }

    // Temperature — required
    if (!temp.value.trim()) {
      errs.temp = true;
    } else {
      const v = Number(temp.value);
      if (isNaN(v) || v < 30 || v > 45) { setError("Temperature must be 30–45°C."); errs.temp = true; setFieldErrors(errs); return; }
      reading.temperature = parseFloat(v.toFixed(1));
    }

    // Blood Pressure — required (both fields)
    if (!systolic.trim() || !diastolic.trim()) {
      errs.bp = true;
    } else {
      const s = Number(systolic), d = Number(diastolic);
      if (isNaN(s) || s < 50 || s > 250 || isNaN(d) || d < 30 || d > 200) {
        setError("Blood pressure values seem out of range."); errs.bp = true; setFieldErrors(errs); return;
      }
      reading.systolicBp = Math.round(s);
      reading.diastolicBp = Math.round(d);
    }

    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      setError("All 4 readings are required — please fill in every field.");
      return;
    }
    setFieldErrors({});

    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const ok = await syncReading(reading);
    if (ok) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSubmitted(true);
      setTimeout(() => { reset(); }, 3000);
    } else {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError("Sync failed — reading saved locally and will retry automatically.");
    }
  }

  const s = styles(colors, insets);
  const fes = fieldErrors;

  if (submitted) {
    return (
      <View style={s.successContainer}>
        <View style={s.successCircle}>
          <Feather name="check" size={36} color="#fff" />
        </View>
        <Text style={s.successTitle}>Reading Sent!</Text>
        <Text style={s.successText}>Your vitals have been sent to PulseRPM and your provider has been notified.</Text>
        <Pressable onPress={reset} style={s.successBtn}>
          <Text style={s.successBtnText}>Log Another</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{
        padding: 16, gap: 12,
        paddingTop: Platform.OS === "web" ? 67 + 16 : 16,
        paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 100),
      }}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={s.pageHint}>All 4 readings are required. Open your Oraimo app, note your readings, and enter them below.</Text>

      <VitalInput
        label="Heart Rate" unit="bpm" icon="heart" iconColor="#ef4444"
        placeholder="72" hint="Open Oraimo → Heart Rate"
        state={heartRate}
        onChange={(v) => setHeartRate({ ...heartRate, value: v })}
        hasError={fes.heartRate}
      />
      <VitalInput
        label="Blood Oxygen (SpO₂)" unit="%" icon="droplet" iconColor="#3b82f6"
        placeholder="98" hint="Open Oraimo → Blood Oxygen / SpO₂"
        state={spo2}
        onChange={(v) => setSpo2({ ...spo2, value: v })}
        hasError={fes.spo2}
      />
      <VitalInput
        label="Body Temperature" unit="°C" icon="thermometer" iconColor="#f59e0b"
        placeholder="36.6" hint="Open Oraimo → Body Temperature"
        state={temp}
        onChange={(v) => setTemp({ ...temp, value: v })}
        hasError={fes.temp}
      />

      {/* Blood Pressure — always required */}
      <View style={[s.bpCard, fes.bp && { borderWidth: 1, borderColor: "#ef4444" }]}>
        <View style={s.bpHeader}>
          <View style={[s.iconBox, { backgroundColor: "#8b5cf615" }]}>
            <Feather name="bar-chart-2" size={16} color="#8b5cf6" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.bpLabel}>Blood Pressure</Text>
            <Text style={s.bpUnit}>mmHg</Text>
          </View>
          <View style={[s.requiredBadge, { backgroundColor: "#8b5cf615" }]}>
            <Text style={[s.requiredText, { color: "#8b5cf6" }]}>Required</Text>
          </View>
        </View>
        <View style={{ marginTop: 10, gap: 6 }}>
          <View style={s.bpRow}>
            <View style={{ flex: 1 }}>
              <TextInput
                style={s.bpInput}
                value={systolic}
                onChangeText={setSystolic}
                placeholder="120"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="numeric"
              />
              <Text style={s.bpFieldLabel}>Systolic (top)</Text>
            </View>
            <Text style={s.bpSlash}>/</Text>
            <View style={{ flex: 1 }}>
              <TextInput
                style={s.bpInput}
                value={diastolic}
                onChangeText={setDiastolic}
                placeholder="80"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="numeric"
              />
              <Text style={s.bpFieldLabel}>Diastolic (bottom)</Text>
            </View>
          </View>
          <Text style={s.bpHint}>Open Oraimo → Blood Pressure</Text>
        </View>
      </View>

      {!!error && (
        <View style={s.errorBox}>
          <Feather name="alert-circle" size={14} color="#ef4444" />
          <Text style={s.errorText}>{error}</Text>
        </View>
      )}

      <Pressable
        onPress={handleSubmit}
        disabled={loading || !paired}
        style={({ pressed }) => [s.submitBtn, (loading || !paired) && s.submitDisabled, pressed && { opacity: 0.85 }]}
      >
        {loading ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <>
            <Feather name="send" size={18} color="#fff" />
            <Text style={s.submitText}>Sync to PulseRPM</Text>
          </>
        )}
      </Pressable>
    </ScrollView>
  );
}

function styles(colors: ReturnType<typeof useColors>, insets: { top: number; bottom: number }) {
  return StyleSheet.create({
    pageHint: { fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular", lineHeight: 18, paddingHorizontal: 2 },
    bpCard: {
      backgroundColor: colors.card, borderRadius: 14, padding: 14,
      shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 1 },
      elevation: 1,
    },
    bpHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
    bpLabel: { fontSize: 14, fontWeight: "600", color: colors.foreground, fontFamily: "Inter_600SemiBold" },
    bpUnit: { fontSize: 11, color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
    requiredBadge: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
    requiredText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
    bpRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    bpSlash: { fontSize: 24, color: colors.mutedForeground, fontFamily: "Inter_400Regular", paddingTop: 4 },
    bpInput: {
      backgroundColor: colors.secondary, borderRadius: 10,
      paddingHorizontal: 14, paddingVertical: 12,
      fontSize: 22, fontFamily: "Inter_700Bold", fontWeight: "700", color: colors.foreground,
      textAlign: "center", letterSpacing: 2,
    },
    bpFieldLabel: { fontSize: 10, color: colors.mutedForeground, textAlign: "center", marginTop: 4, fontFamily: "Inter_400Regular" },
    bpHint: { fontSize: 11, color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
    iconBox: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center" },
    errorBox: {
      flexDirection: "row", alignItems: "center", gap: 6,
      backgroundColor: "#fef2f2", borderRadius: 10, padding: 10,
    },
    errorText: { flex: 1, fontSize: 13, color: "#ef4444", fontFamily: "Inter_400Regular" },
    submitBtn: {
      backgroundColor: colors.primary, borderRadius: 14,
      paddingVertical: 16, flexDirection: "row", alignItems: "center",
      justifyContent: "center", gap: 10,
      shadowColor: colors.primary, shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 3 },
      elevation: 3,
    },
    submitDisabled: { opacity: 0.6 },
    submitText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold", fontWeight: "600" },
    successContainer: {
      flex: 1, backgroundColor: colors.background,
      alignItems: "center", justifyContent: "center",
      padding: 32, gap: 16,
    },
    successCircle: {
      width: 80, height: 80, borderRadius: 40,
      backgroundColor: colors.success,
      alignItems: "center", justifyContent: "center",
      shadowColor: colors.success, shadowOpacity: 0.3, shadowRadius: 16, shadowOffset: { width: 0, height: 4 },
      elevation: 4,
    },
    successTitle: { fontSize: 22, fontWeight: "700", color: colors.foreground, fontFamily: "Inter_700Bold" },
    successText: { fontSize: 14, color: colors.mutedForeground, textAlign: "center", lineHeight: 20, fontFamily: "Inter_400Regular" },
    successBtn: {
      backgroundColor: colors.primary, borderRadius: 14,
      paddingVertical: 14, paddingHorizontal: 32,
      marginTop: 8,
    },
    successBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold", fontWeight: "600" },
  });
}
