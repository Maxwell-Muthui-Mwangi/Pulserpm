# Remote Patient Monitoring (RPM) System

## Overview

A full-stack Remote Patient Monitoring platform for healthcare providers. Monitors elderly patients with chronic conditions via wearable device data integration, real-time vitals tracking, and automated alert generation.

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
