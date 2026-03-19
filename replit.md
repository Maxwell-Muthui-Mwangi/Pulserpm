# Remote Patient Monitoring (RPM) System — PulseRPM

## Overview

A full-stack Remote Patient Monitoring platform with role-based access control for both healthcare providers and patients. Monitors elderly patients with chronic conditions via wearable device data integration, real-time vitals tracking, and automated alert generation.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Frontend**: React + Vite + Tailwind CSS + Recharts + Framer Motion

## Role-Based Access

### Provider view
- Dashboard (`/`): 4 KPI cards (Total Patients, Active Alerts, Patients in Danger, Today's Readings), Patient Status breakdown (Critical/Warning/Stable counts), 7-Day Vital Trends charts (Heart Rate + Systolic BP, SpO2 + Temperature), Patient Monitoring table
- Sidebar: Overview, Patients, Alerts
- Notification bell: dropdown shows only critical+warning patient alerts with patient names and severity badges
- Full patient list, alert management, threshold configuration
- Can acknowledge/resolve alerts, view all patients

### Patient view
- Only see their own data (enforced at API level — 403 on cross-patient access)
- Dashboard: "Your Status" with Critical/Average/Good levels, 3 KPI cards (Active Alerts, Today's Readings, Overall Status)
- Profile: own vitals, history charts, alerts (read-only)
- "Connect Device" tab: API key management + integration instructions
- Sidebar shows: My Dashboard, My Profile, My Alerts

### Session management
- Login: `setAuthToken` → `queryClient.clear()` → `window.location.href` (full page reload ensures clean state for role switching)
- Logout: `queryClient.clear()` → `removeAuthToken` → SPA redirect to /login
- `useGetMe` uses `queryKey: ["me", token]` — token change = fresh cache entry, no stale role data

## Device & Wearable Integration

### Device API Key system (`/api/device/`)
- `POST /api/device/generate-key` — patient generates a UUID API key
- `GET /api/device/key` — fetch current key
- `DELETE /api/device/key` — revoke key

### Data Ingest endpoint (no JWT required)
- `POST /api/device/ingest` with `X-Device-Api-Key` header
- Accepts multiple formats: standard, Apple Health (Shortcuts), Fitbit, Google Fit, generic REST
- Runs alert engine on each reading
- Response: `{ success, vitalsId, patientId, alertsTriggered }`

### Supported payload formats
Standard: `{ heartRate, systolicBp, diastolicBp, spo2, temperature, caloriesBurned, recordedAt }`
Apple Health: `{ HeartRate, BloodPressureSystolic, BloodPressureDiastolic, OxygenSaturation, BodyTemperature, StartDate }`
Fitbit: `{ heart: { restingHeartRate }, spo2: { value } }`
Google Fit: `{ heartRate: { bpm }, bloodPressure: { systolic, diastolic }, oxygen: { saturation } }`

## Structure

```text
artifacts-monorepo/
├── artifacts/
│   ├── api-server/         # Express API server (backend)
│   └── rpm-dashboard/      # React provider dashboard (frontend, serves at /)
├── lib/
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/
│   └── src/seed.ts         # Database seed script (5 patients, 48h vitals)
```

## Key Features

### Backend (artifacts/api-server)
- JWT-based authentication (HMAC-SHA256)
- Role-based access: `provider`, `admin`, `patient`
- Full CRUD for patients and providers
- Vitals ingestion (single + batch) from any wearable source
- **Alert Rules Engine** (`src/lib/alertEngine.ts`): evaluates vitals against configurable per-patient thresholds
  - Heart rate, blood pressure (systolic/diastolic), SpO2, temperature
  - Warning and critical severity levels
  - Suggested clinical actions per alert type
- Dashboard statistics endpoint
- Daily summary with averages/min/max

### Frontend (artifacts/rpm-dashboard)
- Login page with JWT token stored in `localStorage`
- Dashboard overview with stats cards and active alerts
- Patient list with search, risk-level filter (normal/warning/critical), color-coded indicators
- Patient detail with vitals history charts (Recharts) and threshold configuration
- Alerts management with acknowledge/resolve actions
- Responsive sidebar layout

### Database Schema (lib/db/src/schema/)
- `providers` — healthcare providers with hashed passwords
- `patients` — patient profiles with conditions array, wearable device type
- `vitals` — time-series readings (HR, BP, SpO2, calories, temperature)
- `thresholds` — configurable per-patient alert thresholds (warning + critical)
- `alerts` — triggered alerts with status lifecycle (active → acknowledged → resolved)

## API Routes

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/auth/login | Login for providers and patients |
| GET | /api/auth/me | Get current user |
| GET | /api/providers | List providers |
| POST | /api/providers | Create provider |
| GET | /api/patients | List patients (search, filter by risk) |
| POST | /api/patients | Create patient |
| GET | /api/patients/:id | Patient detail with latest vitals |
| PUT | /api/patients/:id | Update patient |
| GET | /api/patients/:id/vitals | Vitals history (day/week/month) |
| POST | /api/patients/:id/vitals | Ingest vitals + trigger alerts |
| GET | /api/patients/:id/vitals/latest | Most recent reading |
| GET | /api/patients/:id/summary | Daily summary stats |
| GET | /api/patients/:id/thresholds | Alert thresholds |
| PUT | /api/patients/:id/thresholds | Update thresholds |
| GET | /api/patients/:id/alerts | Patient alert history |
| GET | /api/alerts | All alerts (filterable) |
| POST | /api/alerts/:id/acknowledge | Acknowledge alert |
| POST | /api/alerts/:id/resolve | Resolve alert |
| POST | /api/vitals/ingest-batch | Batch vitals ingest |
| GET | /api/dashboard/stats | Dashboard statistics |

## Demo Credentials

- **Provider**: sarah.mitchell@rpmhospital.com / password123 (Cardiology)
- **Provider**: james.carter@rpmhospital.com / password123 (Internal Medicine)
- **Patient**: eleanor.thompson@email.com / patient123

## Wearable Device Support

Supported source types (normalized):
- `apple_health` (iOS HealthKit)
- `google_fit` (Android)
- `fitbit`
- `garmin`
- `manual`
- `simulated`

## Commands

```bash
# Start API server
pnpm --filter @workspace/api-server run dev

# Start dashboard
pnpm --filter @workspace/rpm-dashboard run dev

# Push DB schema
pnpm --filter @workspace/db run push

# Seed demo data
pnpm --filter @workspace/scripts run seed

# Run codegen (after OpenAPI spec changes)
pnpm --filter @workspace/api-spec run codegen
```

## Alert Threshold Defaults (per patient, configurable)

| Vital | Warning Min | Warning Max | Critical Min | Critical Max |
|-------|-------------|-------------|--------------|--------------|
| Heart Rate (BPM) | 50 | 100 | 40 | 120 |
| Systolic BP (mmHg) | 90 | 140 | 80 | 180 |
| Diastolic BP (mmHg) | 60 | 90 | — | 120 |
| SpO2 (%) | 95 | — | 90 | — |
| Temperature (°C) | 36.0 | 37.5 | — | 39.0 |
