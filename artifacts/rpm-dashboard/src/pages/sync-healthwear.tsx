import { useState, useEffect } from "react";
import {
  Heart, Activity, Droplets, Thermometer, Gauge, Flame,
  CheckCircle2, AlertCircle, Loader2, Watch, Zap, ShieldCheck,
} from "lucide-react";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type SubmitState = "idle" | "loading" | "success" | "error";

interface VitalField {
  key: string;
  label: string;
  unit: string;
  icon: React.ReactNode;
  placeholder: string;
  min: number;
  max: number;
  step: number;
  hint: string;
  color: string;
}

const VITAL_FIELDS: VitalField[] = [
  {
    key: "heartRate",
    label: "Heart Rate",
    unit: "bpm",
    icon: <Heart className="h-4 w-4" />,
    placeholder: "72",
    min: 30,
    max: 250,
    step: 1,
    hint: "Healthwear → Live Vitals → Heart Rate",
    color: "text-rose-500",
  },
  {
    key: "spo2",
    label: "Blood Oxygen (SpO₂)",
    unit: "%",
    icon: <Droplets className="h-4 w-4" />,
    placeholder: "98",
    min: 50,
    max: 100,
    step: 1,
    hint: "Healthwear → Live Vitals → SpO₂ / Blood Oxygen",
    color: "text-blue-500",
  },
  {
    key: "temperature",
    label: "Body Temperature",
    unit: "°C",
    icon: <Thermometer className="h-4 w-4" />,
    placeholder: "36.6",
    min: 30,
    max: 45,
    step: 0.1,
    hint: "Healthwear → Health Data → Temperature",
    color: "text-orange-500",
  },
  {
    key: "caloriesBurned",
    label: "Calories Burned",
    unit: "kcal",
    icon: <Flame className="h-4 w-4" />,
    placeholder: "320",
    min: 0,
    max: 5000,
    step: 1,
    hint: "Healthwear → Activity → Today's Calories",
    color: "text-amber-500",
  },
];

function HWLogo({ className = "" }: { className?: string }) {
  return (
    <span className={`font-extrabold tracking-tight ${className}`}>
      <span className="text-emerald-500">Health</span>
      <span className="text-teal-700">wear</span>
    </span>
  );
}

export default function SyncHealthwear() {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [systolic, setSystolic] = useState("");
  const [diastolic, setDiastolic] = useState("");
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [lastSync, setLastSync] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const key = params.get("apiKey");
    if (key) setApiKey(key);
  }, []);

  function setValue(key: string, val: string) {
    setValues((prev) => ({ ...prev, [key]: val }));
  }

  function validate(): string | null {
    const hasHR = values.heartRate && !isNaN(Number(values.heartRate));
    const hasSpo2 = values.spo2 && !isNaN(Number(values.spo2));
    const hasTemp = values.temperature && !isNaN(Number(values.temperature));
    const hasBP =
      systolic && diastolic &&
      !isNaN(Number(systolic)) && !isNaN(Number(diastolic));
    const hasCal = values.caloriesBurned && !isNaN(Number(values.caloriesBurned));

    if (!hasHR && !hasSpo2 && !hasTemp && !hasBP && !hasCal) {
      return "Please enter at least one reading before syncing.";
    }
    if (values.heartRate) {
      const hr = Number(values.heartRate);
      if (hr < 30 || hr > 250) return "Heart rate must be between 30–250 bpm.";
    }
    if (values.spo2) {
      const o2 = Number(values.spo2);
      if (o2 < 50 || o2 > 100) return "SpO₂ must be between 50–100%.";
    }
    if (systolic || diastolic) {
      if (!systolic || !diastolic) return "Enter both systolic and diastolic blood pressure values.";
      if (Number(systolic) < 50 || Number(systolic) > 250) return "Systolic BP must be between 50–250 mmHg.";
      if (Number(diastolic) < 30 || Number(diastolic) > 200) return "Diastolic BP must be between 30–200 mmHg.";
    }
    return null;
  }

  async function handleSync() {
    if (!apiKey) {
      setErrorMsg("No API key found. Scan the QR code from PulseRPM again.");
      return;
    }
    const err = validate();
    if (err) { setErrorMsg(err); return; }

    setErrorMsg("");
    setSubmitState("loading");

    const payload: Record<string, number | string> = { source: "healthwear" };

    if (values.heartRate) payload.heartRate = Number(values.heartRate);
    if (values.spo2) payload.spo2 = Number(values.spo2);
    if (values.temperature) payload.temperature = Number(values.temperature);
    if (values.caloriesBurned) payload.caloriesBurned = Number(values.caloriesBurned);
    if (systolic && diastolic) {
      payload.systolicBp = Number(systolic);
      payload.diastolicBp = Number(diastolic);
    }

    try {
      const res = await fetch(`${window.location.origin}${API_BASE}/api/device/ingest`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Device-Api-Key": apiKey,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || `Server error ${res.status}`);
      }

      setSubmitState("success");
      setLastSync(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
      setValues({});
      setSystolic("");
      setDiastolic("");
    } catch (e: unknown) {
      setSubmitState("error");
      setErrorMsg(e instanceof Error ? e.message : "Failed to sync. Please try again.");
    }
  }

  function resetForm() {
    setSubmitState("idle");
    setErrorMsg("");
  }

  if (!apiKey) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-sm w-full text-center space-y-4">
          <div className="h-14 w-14 bg-red-50 rounded-full flex items-center justify-center mx-auto">
            <AlertCircle className="h-7 w-7 text-red-500" />
          </div>
          <h1 className="text-lg font-bold text-gray-900">Invalid Sync Link</h1>
          <p className="text-sm text-gray-500">
            This link is missing your patient API key. Open{" "}
            <strong>PulseRPM → My Dashboard → Connect Smartwatch</strong> and scan the Healthwear QR code.
          </p>
        </div>
      </div>
    );
  }

  if (submitState === "success") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-sm w-full text-center space-y-5">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 className="h-9 w-9 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Readings Synced!</h1>
            {lastSync && <p className="text-sm text-gray-400 mt-1">Logged at {lastSync}</p>}
          </div>
          <p className="text-sm text-gray-500">
            Your <HWLogo /> readings have been sent to PulseRPM and are now visible in your dashboard and your provider's monitoring panel.
          </p>
          <button
            onClick={resetForm}
            className="w-full bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 text-white font-semibold py-3 rounded-xl transition-colors"
          >
            Log Another Reading
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-10 shadow-sm">
        <div className="max-w-lg mx-auto px-4 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center shadow-sm">
              <Activity className="h-[18px] w-[18px] text-white" />
            </div>
            <div>
              <span className="font-bold text-emerald-600 text-sm leading-none">PulseRPM</span>
              <p className="text-[10px] text-gray-400 leading-none mt-0.5">
                Sync from <HWLogo className="text-[10px]" />
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-1">
            <Watch className="h-3 w-3 text-emerald-600" />
            <span className="text-xs font-medium text-emerald-700">Healthwear Connected</span>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-5 space-y-4">
        {/* Intro banner */}
        <div className="bg-white border border-emerald-100 rounded-xl p-4 flex items-start gap-3 shadow-sm">
          <div className="h-8 w-8 bg-emerald-100 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-800"><HWLogo /> Full Vitals Sync</p>
            <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
              Your Healthwear device supports all vitals. Open the <strong>Healthwear app</strong>, navigate to <strong>Live Vitals</strong> or <strong>Health Data</strong>, and enter the readings below.
            </p>
          </div>
        </div>

        {/* Vital input cards */}
        <div className="space-y-3">
          {VITAL_FIELDS.map((field) => (
            <div key={field.key} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-4 pt-3.5 pb-1 flex items-center gap-2">
                <span className={field.color}>{field.icon}</span>
                <span className="font-semibold text-sm text-gray-800">{field.label}</span>
                <span className="text-xs text-gray-400">{field.unit}</span>
              </div>
              <div className="px-4 pb-3.5">
                <input
                  type="number"
                  inputMode="decimal"
                  value={values[field.key] || ""}
                  onChange={(e) => setValue(field.key, e.target.value)}
                  placeholder={field.placeholder}
                  min={field.min}
                  max={field.max}
                  step={field.step}
                  className="w-full mt-1.5 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-base font-mono text-gray-900 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent"
                />
                <p className="text-[11px] text-gray-400 mt-1.5">{field.hint}</p>
              </div>
            </div>
          ))}

          {/* Blood Pressure */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-4 pt-3.5 pb-1 flex items-center gap-2">
              <Gauge className="h-4 w-4 text-purple-500" />
              <span className="font-semibold text-sm text-gray-800">Blood Pressure</span>
              <span className="text-xs text-gray-400">mmHg</span>
            </div>
            <div className="px-4 pb-3.5">
              <div className="flex gap-2 mt-1.5">
                <div className="flex-1">
                  <input
                    type="number"
                    inputMode="numeric"
                    value={systolic}
                    onChange={(e) => setSystolic(e.target.value)}
                    placeholder="120"
                    min={50}
                    max={250}
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-base font-mono text-gray-900 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent"
                  />
                  <p className="text-[10px] text-gray-400 mt-1 text-center">Systolic (top)</p>
                </div>
                <div className="flex items-center pt-1 text-gray-300 font-bold text-lg">/</div>
                <div className="flex-1">
                  <input
                    type="number"
                    inputMode="numeric"
                    value={diastolic}
                    onChange={(e) => setDiastolic(e.target.value)}
                    placeholder="80"
                    min={30}
                    max={200}
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-base font-mono text-gray-900 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent"
                  />
                  <p className="text-[10px] text-gray-400 mt-1 text-center">Diastolic (bottom)</p>
                </div>
              </div>
              <p className="text-[11px] text-gray-400 mt-1.5">Healthwear → Health Data → Blood Pressure</p>
            </div>
          </div>
        </div>

        {/* Error message */}
        {errorMsg && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
            <p className="text-sm text-red-700">{errorMsg}</p>
          </div>
        )}

        {/* Submit */}
        <button
          onClick={handleSync}
          disabled={submitState === "loading"}
          className="w-full bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 disabled:bg-emerald-300 text-white font-bold py-4 rounded-xl text-base transition-colors flex items-center justify-center gap-2 shadow-md"
        >
          {submitState === "loading" ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" /> Syncing…
            </>
          ) : (
            <>
              <Zap className="h-5 w-5" /> Sync to PulseRPM
            </>
          )}
        </button>

        <p className="text-[11px] text-center text-gray-400 pb-6">
          Readings are encrypted in transit and shared only with your assigned healthcare provider.
        </p>
      </div>
    </div>
  );
}
