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

## Patient Enrollment Flow

### Patient self-signup (3-step)
1. **Patient signs up** via `/login` → "Sign Up" → "Patient" role → enters name/email/password → `POST /api/auth/patient-signup` → creates row in `pending_patients` table + sends 6-digit verification email (15-min expiry)
2. **Email verification** → patient enters 6-digit code → `POST /api/auth/verify-email` → marks `email_verified=true`. Resend via `POST /api/auth/resend-code`. If code wrong/expired, patient is prompted to resend.
3. **Awaiting approval** → patient sees "Your account is awaiting approval" screen. They cannot log into the patient UI until approved.

### Provider approval flow
- **Badge**: `GET /api/patients/pending/count` (polled every 30s) — count of email-verified pending patients shown as red badge on "Add Patient" button
- **Modal**: clicking "Add Patient" opens modal → `GET /api/patients/pending` → list of verified patients awaiting approval
- **Approve**: provider clicks patient → fills Age, Gender, Health Conditions → clicks "Approve" → `POST /api/patients/pending/:id/approve` → creates full patient record in `patients` table with `approval_welcome_pending=true`, deletes from `pending_patients`

### Post-approval welcome
- On first login after approval, `GET /api/auth/me` returns `approvalWelcomePending: true`
- Layout shows a one-time "Welcome to PulseRPM!" popup
- Patient clicks "Get Started" → `POST /api/auth/dismiss-welcome` sets `approval_welcome_pending=false`

### DB tables
- `pending_patients`: `id, name, email, password_hash, verification_code, verification_expiry, email_verified, created_at`
- `patients.approval_welcome_pending`: boolean, defaults to `false`, set to `true` when provider approves

### Email
- `sendVerificationEmail(to, name, code)` in `lib/email.ts` — gracefully skips if SMTP not configured (logs code to console)

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

## Companion Mobile App (PulseRPM Mobile)

Expo/React Native app at `artifacts/pulserpm-mobile`. Allows patients to sync vitals manually from Oraimo smartwatch.

### Screens
- **Pair screen** (`/pair`): QR code scanner (expo-camera) + manual API key entry. Auto-redirects here when not paired.
- **Monitor tab** (`/(tabs)/index`): Sync status, last reading pills (HR/SpO₂/Temp/BP), quick log CTA, recent sync history.
- **Log tab** (`/(tabs)/log`): Manual vitals entry form with validation. Skip fields that aren't available. Sends to `/api/device/ingest` with `source: "oraimo"`.
- **Settings tab** (`/(tabs)/settings`): API key display, sync stats, health platform status (Google Fit/Apple Health = APK-only), disconnect.

### State (AppContext)
- `apiKey`: stored in AsyncStorage; controls paired/unpaired state
- Pending queue: failed readings stored in AsyncStorage and retried on foreground resume (AppState listener)
- Sync log: last 50 entries with status, timestamps, alert counts

### Limitations
- Google Fit / Apple HealthKit auto-sync requires native APK build (not available in Expo Go)
- Current flow: Open Oraimo app → note readings → enter in Log tab → sync to PulseRPM

## Wearable Device Support

Supported source types (normalized):
- `oraimo` (manual entry from Oraimo Health app — works now via mobile app Log tab)
- `apple_health` (iOS HealthKit — auto-sync in native build)
- `google_fit` (Android — auto-sync in native build)
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

## Security & HIPAA Compliance

### Security Headers (Helmet)
- Applied globally via `helmet()` — sets X-Content-Type-Options, X-Frame-Options, Referrer-Policy, and more
- CORS restricted to `*.replit.dev`, `*.replit.app`, `localhost`

### Rate Limiting
- **Auth endpoints** (`/api/auth/login`, `/api/auth/signup`, `/api/auth/patient-signup`): 10 requests per 15 minutes per IP
- **General API**: 200 requests per minute per IP
- **Device ingest**: 60 requests per minute per IP
- Returns `429 Too Many Requests` with a clear message

### Audit Logging (HIPAA §164.312(b))
- **Table**: `audit_logs` — records every significant system event
- **Fields**: timestamp, actor ID/email/role, action, resource type/ID, IP address, user agent, outcome (success/failure/denied), details JSON
- **Captured events**: all login attempts (success, failure, denial with reason), all authenticated write operations (thresholds, alerts, patient data, vitals), sign-ups, patient approvals
- **Auto-middleware**: `auditMiddleware` hooks into all authenticated POST/PUT/DELETE/PATCH requests via `res.on('finish')`
- **Explicit logging**: `logAuditEvent()` used in auth routes for precise context
- **API**: `GET /api/audit?limit&offset&outcome&action` — providers only, returns paginated log with total count
- **UI**: `/security` page in provider sidebar — searchable/filterable table with color-coded outcomes and action badges
- **Non-blocking**: All writes use `setImmediate()` — never slows down responses

## Alert Threshold Defaults (per patient, configurable)

| Vital | Warning Min | Warning Max | Critical Min | Critical Max |
|-------|-------------|-------------|--------------|--------------|
| Heart Rate (BPM) | 50 | 100 | 40 | 120 |
| Systolic BP (mmHg) | 90 | 140 | 80 | 180 |
| Diastolic BP (mmHg) | 60 | 90 | — | 120 |
| SpO2 (%) | 95 | — | 90 | — |
| Temperature (°C) | 36.0 | 37.5 | — | 39.0 |
