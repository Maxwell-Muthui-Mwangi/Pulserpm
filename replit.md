# Remote Patient Monitoring (RPM) System — PulseRPM

## Overview

PulseRPM is a full-stack Remote Patient Monitoring platform designed to enhance the care of elderly patients with chronic conditions. It integrates data from wearable devices, provides real-time vital tracking, and generates automated alerts to healthcare providers. The system supports role-based access for both patients and healthcare professionals, aiming to improve patient outcomes through continuous monitoring and timely interventions. This platform also includes an academic assignment scheduler for a private tutor.

## User Preferences

- I want iterative development.
- I want to be asked before making major changes.
- I prefer clear and concise explanations.
- I prefer that you do not make changes to the folder `artifacts/pulserpm-mobile/`.

## System Architecture

The project is structured as a monorepo using pnpm workspaces.

### Technical Stack

- **Backend**: Node.js 24, Express 5, PostgreSQL, Drizzle ORM, Zod.
- **Frontend**: React, Vite, Tailwind CSS, Recharts, Framer Motion.
- **Mobile**: Expo/React Native for the patient-facing mobile application.
- **Build**: esbuild.
- **API**: OpenAPI specification with Orval for client code generation (React Query hooks, Zod schemas).

### Core Features

- **Role-Based Access Control**: Differentiated UIs and API access for `provider`, `admin`, and `patient` roles.
  - **Provider View**: Dashboard with KPIs, patient status breakdown, vital trends, patient monitoring table, alert management, and patient threshold configuration.
  - **Patient View**: Personalized dashboard, profile with vitals history, alerts (read-only), and device connection management.
- **Patient Enrollment**:
  - **Self-signup**: 3-step process involving email verification.
  - **Provider Approval**: Providers approve pending patients via a dedicated interface, triggering welcome emails.
- **Device & Wearable Integration**:
  - **API Key System**: Patients generate unique API keys for device data submission.
  - **Data Ingest Endpoint**: Accepts vital sign data from various sources (standard, Apple Health, Fitbit, Google Fit, generic REST) and triggers the alert engine.
- **Alert Rules Engine**: Configurable per-patient thresholds (warning/critical) for heart rate, blood pressure, SpO2, and temperature, with suggested clinical actions.
- **Security & Compliance**:
  - **JWT Authentication**: HMAC-SHA256, token expiry, and secure storage.
  - **Security Headers**: Global application of Helmet middleware.
  - **Rate Limiting**: Configurable limits for authentication, general API, and device ingest endpoints.
  - **Audit Logging (HIPAA Compliant)**: Records significant system events, including authentication attempts, data modifications, and sign-ups. Logs are non-blocking and accessible via an API and provider UI.
- **Academic Assignment Scheduler**: A fully standalone sub-application (`/scheduler/`) with its own dedicated API server (`artifacts/scheduler-api/`, port 3001). Completely decoupled from PulseRPM — its own Express server, DB schema, JWT auth (`SCHEDULER_JWT_SECRET`), CSRF protection, cron jobs, and email logic. Manages students, assignments, classes, and payments with email notifications and a calendar dashboard.

### UI/UX Design

- **Provider Dashboard**: Four KPI cards, patient status charts, 7-day vital trends, and a patient monitoring table.
- **Patient Dashboard**: "Your Status" with health levels, 3 KPI cards, and personalized alerts.
- **Responsive Layout**: Sidebar navigation for both provider and patient interfaces.
- **Data Visualization**: Recharts for vital history charts.
- **Mobile App**: QR code scanner for device pairing, manual vital entry, sync status, and settings.

### Database Schema

- **RPM system** (`lib/db/`): `providers`, `patients`, `vitals`, `thresholds`, `alerts`, `pending_patients`, `audit_logs`.
- **Scheduler** (`artifacts/scheduler-api/src/lib/db.ts`): `scheduler_tutors`, `scheduler_students`, `scheduler_classes`, `scheduler_assignments`, `scheduler_payments`, `scheduler_notifications` — managed entirely within the scheduler-api, not in lib/db.

## External Dependencies

- **Email Service**: Resend (for patient verification, approval, and new patient notifications), SMTP for scheduler notifications.
- **Wearable Data Sources**: Apple Health, Fitbit, Google Fit, Garmin (integration via data ingest endpoint).
- **Payment Gateway**: Not explicitly detailed, but implied by "payment tracking" in the scheduler.