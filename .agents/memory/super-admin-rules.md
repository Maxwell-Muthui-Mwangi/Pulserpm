---
name: Super Admin role rules and protection
description: Role hierarchy, Maxwell protection rules, and schema details for PulseRPM's admin system.
---

# Super Admin / Role Hierarchy Rules

## Role hierarchy
- `isSuperAdmin = true` + `role = "admin"` → founding super admin (Maxwell). Untouchable.
- `role = "admin"` → regular admin. Sees all patients/providers, can approve providers and grant manager rights. Cannot touch Maxwell.
- `role = "provider"` + `isManager = true` → manager. Provider with elevated visibility (future feature).
- `role = "provider"` → standard provider. Sees only their own patients.

## Maxwell's permanent protections (enforced in API)
- Email: `maxwellmuthuimwangi@gmail.com` — hardcoded as `SUPER_ADMIN_EMAIL` in `providers.ts` and `audit.ts`.
- Cannot be deleted via any endpoint — `DELETE /admin/providers/:id/reject` blocks if `isSuperAdmin = true` OR email matches.
- Other admins cannot view his audit log entries — `GET /audit` adds `ne(actorEmail, SUPER_ADMIN_EMAIL)` filter for non-super-admin callers.
- His role cannot be changed — `POST /admin/providers/:id/set-role` blocks if target is Maxwell.
- Patients cannot be assigned to him — approve endpoint checks `isSuperAdmin` before inserting patient.
- He does not appear in the public provider list (patient signup dropdown) — filtered by `!p.isSuperAdmin`.
- Any patient record linked to the founding admin is internal-only: exclude it from patient rosters, patient management, patient details, reports, and healthcare/anomaly metrics.

## DB columns added
- `providers.is_super_admin` — boolean, default false. Maxwell is the only row with `true`.
- `providers.is_manager` — boolean, default false. Grants a provider lite elevated rights.

## Audit log schema
- The timestamp column is `auditLogsTable.timestamp` (NOT `createdAt`). Using `createdAt` causes a SQL syntax error.

## Sidebar guard
- Regular providers see: Overview, Patients, Alerts only.
- Admins additionally see: Audit Log, Threat Detection, Blockchain Monitor, Security Framework, Admin Panel.
- Super admin sees "Super Admin" label; regular admins see "Admin Panel" label.

**Why:** Maxwell is the founding account of the system and must be permanently undeletable by design. His internal patient record must never be presented or counted as a real healthcare patient. Other admins are provider-level users with elevated features, not full system admins.

**How to apply:** Any new delete/modify endpoint that touches `providersTable` must check `isSuperAdmin` or `email === SUPER_ADMIN_EMAIL`. Any patient-facing query or aggregate must exclude admin-patient records.
