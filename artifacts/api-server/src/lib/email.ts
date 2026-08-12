import nodemailer from "nodemailer";

interface AlertEmailData {
  providerName: string;
  providerEmail: string;
  patientId: number;
  patientAge: number | null;
  patientGender: string | null;
  patientConditions: string[];
  alerts: Array<{
    vitalType: string;
    severity: "warning" | "critical";
    message: string;
    suggestedAction: string;
  }>;
}

// ── Resend (HTTP API) ────────────────────────────────────────────────────────
async function sendViaResend(to: string, subject: string, html: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;

  const fromEmail = process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev";
  const fromName  = process.env.RESEND_FROM_NAME  ?? "PulseRPM";

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: `${fromName} <${fromEmail}>`, to, subject, html }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(`[email] Resend error ${res.status}:`, body);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[email] Resend request failed:", err);
    return false;
  }
}

// ── SMTP (Gmail / Outlook / Yahoo / any provider) ────────────────────────────
// Creates a nodemailer transporter.
// Priority: explicit SMTP_HOST env var → auto-detect from SMTP_USER domain.
// SMTP_HOST is *optional* — Gmail, Outlook, Yahoo, and iCloud are detected automatically.
function createSmtpTransporter(): nodemailer.Transporter | null {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!user || !pass) return null;

  const auth = { user, pass };

  const explicitHost = process.env.SMTP_HOST;
  if (explicitHost) {
    const port = parseInt(process.env.SMTP_PORT ?? "587", 10);
    console.log(`[email] SMTP: using explicit host ${explicitHost}:${port}`);
    return nodemailer.createTransport({ host: explicitHost, port, secure: port === 465, auth });
  }

  // Auto-detect service from the sender's email domain
  const domain = (user.split("@")[1] ?? "").toLowerCase();

  if (domain === "gmail.com" || domain === "googlemail.com") {
    console.log("[email] SMTP: auto-detected Gmail");
    return nodemailer.createTransport({ service: "Gmail", auth });
  }
  if (["outlook.com", "hotmail.com", "live.com", "live.co.uk", "msn.com"].includes(domain)) {
    console.log("[email] SMTP: auto-detected Outlook/Hotmail");
    return nodemailer.createTransport({ service: "hotmail", auth });
  }
  if (domain === "yahoo.com" || domain === "ymail.com" || domain === "yahoo.co.uk") {
    console.log("[email] SMTP: auto-detected Yahoo");
    return nodemailer.createTransport({ service: "Yahoo", auth });
  }
  if (domain === "icloud.com" || domain === "me.com" || domain === "mac.com") {
    console.log("[email] SMTP: auto-detected iCloud");
    return nodemailer.createTransport({ host: "smtp.mail.me.com", port: 587, secure: false, auth });
  }

  // Unknown domain — need SMTP_HOST to proceed
  console.warn(`[email] SMTP: cannot auto-detect provider for "${domain}". Set SMTP_HOST to configure SMTP delivery.`);
  return null;
}

async function sendViaSmtp(to: string, subject: string, html: string): Promise<boolean> {
  const transport = createSmtpTransporter();
  if (!transport) return false;
  try {
    const user = process.env.SMTP_USER!;
    await transport.sendMail({ from: `"PulseRPM" <${user}>`, to, subject, html });
    return true;
  } catch (err) {
    console.error("[email] SMTP send failed:", err);
    return false;
  }
}

// ── Unified sender ───────────────────────────────────────────────────────────
async function send(to: string, subject: string, html: string, fallbackLog: string): Promise<boolean> {
  // Try Resend first (only if a verified from-domain is configured;
  // the default onboarding@resend.dev only delivers to the Resend account owner)
  const resendKey = process.env.RESEND_API_KEY;
  const resendFromEmail = process.env.RESEND_FROM_EMAIL;
  if (resendKey && resendFromEmail) {
    const ok = await sendViaResend(to, subject, html);
    if (ok) { console.log(`[email] Sent via Resend → ${to}`); return true; }
    console.warn("[email] Resend failed — falling back to SMTP");
  } else if (resendKey && !resendFromEmail) {
    console.warn("[email] Resend API key set but RESEND_FROM_EMAIL not configured. Skipping Resend (onboarding@resend.dev cannot deliver to arbitrary addresses). Set RESEND_FROM_EMAIL to a verified Resend domain to enable.");
  }

  // Try SMTP (SMTP_USER + SMTP_PASS are enough — host auto-detected from domain)
  if (process.env.SMTP_USER && process.env.SMTP_PASS) {
    const ok = await sendViaSmtp(to, subject, html);
    if (ok) { console.log(`[email] Sent via SMTP → ${to}`); return true; }
  }

  // Both failed
  console.warn(`[email] All transports failed — ${fallbackLog}`);
  return false;
}

// ── HTML helpers ─────────────────────────────────────────────────────────────
function formatVitalType(vitalType: string): string {
  const map: Record<string, string> = {
    heart_rate: "Heart Rate",
    blood_pressure: "Blood Pressure",
    spo2: "Blood Oxygen (SpO2)",
    temperature: "Body Temperature",
  };
  return map[vitalType] ?? vitalType.replace(/_/g, " ");
}

function buildAlertEmailHtml(data: AlertEmailData): string {
  const criticalAlerts = data.alerts.filter((a) => a.severity === "critical");
  const overallSeverity = criticalAlerts.length > 0 ? "CRITICAL" : "WARNING";
  const severityColor = overallSeverity === "CRITICAL" ? "#dc2626" : "#d97706";

  const patientRef = `Patient #${data.patientId}`;

  const ageStr = data.patientAge ? `${data.patientAge} years old` : "Age unknown";
  const genderStr = data.patientGender
    ? data.patientGender.charAt(0).toUpperCase() + data.patientGender.slice(1)
    : "Gender unknown";
  const conditionsStr =
    data.patientConditions.length > 0
      ? data.patientConditions.join(", ")
      : "No known conditions";

  const alertRows = data.alerts
    .map(
      (a) => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;">
        <span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;background:${
          a.severity === "critical" ? "#fef2f2" : "#fffbeb"
        };color:${a.severity === "critical" ? "#dc2626" : "#d97706"};">
          ${a.severity.toUpperCase()}
        </span>
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;font-weight:500;">${formatVitalType(a.vitalType)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;color:#374151;">${a.message}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;color:#6b7280;font-size:13px;">${a.suggestedAction}</td>
    </tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:680px;margin:32px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
    <div style="background:${severityColor};padding:24px 32px;">
      <p style="margin:0 0 4px;color:rgba(255,255,255,0.85);font-size:12px;text-transform:uppercase;letter-spacing:1px;">PulseRPM · Patient Alert</p>
      <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">${overallSeverity} — ${patientRef}</h1>
    </div>
    <div style="padding:28px 32px;">
      <p style="margin:0 0 20px;color:#374151;">Dear Dr. ${data.providerName.split(" ").at(-1)},</p>
      <p style="margin:0 0 24px;color:#6b7280;line-height:1.6;">
        <strong style="color:#111827;">${patientRef}</strong> has triggered
        <strong style="color:${severityColor};">${data.alerts.length} alert${data.alerts.length !== 1 ? "s" : ""}</strong>
        that require${data.alerts.length === 1 ? "s" : ""} your immediate attention.
      </p>
      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
        <h2 style="margin:0 0 12px;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:#6b7280;">Patient Profile</h2>
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:4px 0;color:#6b7280;font-size:14px;width:140px;">Reference ID</td><td style="padding:4px 0;color:#111827;font-size:14px;font-weight:600;">${patientRef}</td></tr>
          <tr><td style="padding:4px 0;color:#6b7280;font-size:14px;">Age</td><td style="padding:4px 0;color:#111827;font-size:14px;">${ageStr}</td></tr>
          <tr><td style="padding:4px 0;color:#6b7280;font-size:14px;">Gender</td><td style="padding:4px 0;color:#111827;font-size:14px;">${genderStr}</td></tr>
          <tr><td style="padding:4px 0;color:#6b7280;font-size:14px;">Conditions</td><td style="padding:4px 0;color:#111827;font-size:14px;">${conditionsStr}</td></tr>
        </table>
      </div>
      <h2 style="margin:0 0 12px;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:#6b7280;">Triggered Alerts</h2>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
        <thead>
          <tr style="background:#f9fafb;">
            <th style="padding:10px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;border-bottom:1px solid #e5e7eb;">Severity</th>
            <th style="padding:10px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;border-bottom:1px solid #e5e7eb;">Vital</th>
            <th style="padding:10px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;border-bottom:1px solid #e5e7eb;">Reading</th>
            <th style="padding:10px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;border-bottom:1px solid #e5e7eb;">Recommended Action</th>
          </tr>
        </thead>
        <tbody>${alertRows}</tbody>
      </table>
      <p style="margin:0 0 8px;color:#6b7280;font-size:13px;line-height:1.6;">
        Please review this patient's profile in PulseRPM and take appropriate action based on their
        ${data.patientConditions.length > 0 ? `known conditions (${conditionsStr})` : "health history"},
        age (${ageStr}), and gender (${genderStr}).
      </p>
    </div>
    <div style="padding:16px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;">
      <p style="margin:0;color:#9ca3af;font-size:12px;">This is an automated alert from PulseRPM Remote Patient Monitoring System. Reference: ${patientRef}. Time: ${new Date().toUTCString()}</p>
    </div>
  </div>
</body>
</html>`;
}

function buildVerificationEmailHtml(name: string, code: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:480px;margin:40px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(135deg,#0ea5e9 0%,#0284c7 100%);padding:32px;text-align:center;">
      <span style="font-size:28px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">Pulse<span style="color:rgba(255,255,255,0.7);">RPM</span></span>
    </div>
    <div style="padding:32px;">
      <h2 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#0f172a;">Verify your email address</h2>
      <p style="color:#64748b;font-size:14px;line-height:1.6;margin:0 0 28px;">
        Hi ${name}, welcome to PulseRPM! Enter the 6-digit code below to verify your email address.<br>
        <strong>This code expires in 15 minutes.</strong>
      </p>
      <div style="background:#f1f5f9;border-radius:12px;padding:28px;text-align:center;margin-bottom:28px;">
        <span style="font-size:40px;font-weight:800;letter-spacing:12px;color:#0ea5e9;font-variant-numeric:tabular-nums;">${code}</span>
      </div>
      <p style="color:#94a3b8;font-size:12px;text-align:center;margin:0;">
        If you didn't create a PulseRPM account, you can safely ignore this email.
      </p>
    </div>
    <div style="padding:16px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;">
      <p style="margin:0;color:#cbd5e1;font-size:11px;text-align:center;">PulseRPM · Remote Patient Monitoring</p>
    </div>
  </div>
</body>
</html>`;
}

// ── Public API ───────────────────────────────────────────────────────────────
export async function sendAlertEmail(data: AlertEmailData): Promise<void> {
  const patientRef = `Patient #${data.patientId}`;
  const severity = data.alerts.some((a) => a.severity === "critical") ? "CRITICAL" : "WARNING";
  const subject = `[${severity}] Alert — ${patientRef}`;
  await send(data.providerEmail, subject, buildAlertEmailHtml(data), `skipping alert for ${patientRef}`);
}

export async function sendVerificationEmail(to: string, name: string, code: string): Promise<boolean> {
  return send(to, "Verify your PulseRPM account", buildVerificationEmailHtml(name, code), `verification code for ${to}: ${code}`);
}

// ── Patient approved email ────────────────────────────────────────────────────
function buildPatientApprovedHtml(patientName: string, loginUrl: string): string {
  const firstName = patientName.split(" ")[0];
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:480px;margin:40px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(135deg,#0ea5e9 0%,#0284c7 100%);padding:32px;text-align:center;">
      <span style="font-size:28px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">Pulse<span style="color:rgba(255,255,255,0.7);">RPM</span></span>
    </div>
    <div style="padding:32px;">
      <div style="text-align:center;margin-bottom:24px;">
        <div style="display:inline-flex;align-items:center;justify-content:center;width:56px;height:56px;border-radius:50%;background:#dcfce7;">
          <span style="font-size:26px;">✓</span>
        </div>
      </div>
      <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#0f172a;text-align:center;">You're approved, ${firstName}!</h2>
      <p style="color:#64748b;font-size:14px;line-height:1.7;margin:0 0 28px;text-align:center;">
        Your PulseRPM account has been approved by your care team.<br>
        You can now log in and start monitoring your health.
      </p>
      <div style="text-align:center;margin-bottom:28px;">
        <a href="${loginUrl}" style="display:inline-block;background:#0ea5e9;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:600;">Log In to PulseRPM</a>
      </div>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px 20px;">
        <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#475569;">What you can do now:</p>
        <ul style="margin:0;padding-left:18px;color:#64748b;font-size:13px;line-height:1.8;">
          <li>View your vitals dashboard and health trends</li>
          <li>Connect your smartwatch or wearable device</li>
          <li>Receive personalized health alerts</li>
          <li>Message your care team</li>
        </ul>
      </div>
    </div>
    <div style="padding:16px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;">
      <p style="margin:0;color:#cbd5e1;font-size:11px;text-align:center;">PulseRPM · Remote Patient Monitoring · Secure &amp; HIPAA-Compliant</p>
    </div>
  </div>
</body>
</html>`;
}

export async function sendPatientApprovedEmail(to: string, patientName: string, loginUrl: string): Promise<void> {
  await send(
    to,
    "You've been approved — welcome to PulseRPM!",
    buildPatientApprovedHtml(patientName, loginUrl),
    `approval notification for ${to}`
  );
}

// ── Provider: new patient pending approval ────────────────────────────────────
// Uses patient ID (not name) for confidentiality in provider-facing emails
function buildNewPatientPendingHtml(providerName: string, patientId: number, dashboardUrl: string): string {
  const lastName = providerName.split(" ").at(-1) ?? providerName;
  const patientRef = `Patient #${patientId}`;
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:480px;margin:40px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(135deg,#0ea5e9 0%,#0284c7 100%);padding:32px;text-align:center;">
      <span style="font-size:28px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">Pulse<span style="color:rgba(255,255,255,0.7);">RPM</span></span>
    </div>
    <div style="padding:32px;">
      <h2 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#0f172a;">New patient awaiting approval</h2>
      <p style="color:#64748b;font-size:14px;line-height:1.7;margin:0 0 24px;">
        Dear Dr. ${lastName}, a new patient has verified their email and is waiting for your approval to access PulseRPM.
      </p>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="padding:6px 0;color:#94a3b8;font-size:13px;width:100px;">Reference ID</td>
            <td style="padding:6px 0;color:#0f172a;font-size:14px;font-weight:600;">${patientRef}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#94a3b8;font-size:13px;">Status</td>
            <td style="padding:6px 0;">
              <span style="display:inline-block;padding:2px 10px;border-radius:20px;background:#fef9c3;color:#854d0e;font-size:12px;font-weight:600;">Pending Approval</span>
            </td>
          </tr>
        </table>
      </div>
      <p style="color:#94a3b8;font-size:12px;line-height:1.6;margin:0 0 24px;">
        Patient identity details are available securely within the PulseRPM dashboard to protect patient confidentiality.
      </p>
      <div style="text-align:center;">
        <a href="${dashboardUrl}" style="display:inline-block;background:#0ea5e9;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:600;">Review in Dashboard</a>
      </div>
    </div>
    <div style="padding:16px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;">
      <p style="margin:0;color:#cbd5e1;font-size:11px;text-align:center;">PulseRPM · Remote Patient Monitoring · Secure &amp; HIPAA-Compliant</p>
    </div>
  </div>
</body>
</html>`;
}

// ── Password reset email ──────────────────────────────────────────────────────
function buildPasswordResetEmailHtml(name: string, code: string): string {
  const firstName = name.split(" ")[0];
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:480px;margin:40px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(135deg,#0ea5e9 0%,#0284c7 100%);padding:32px;text-align:center;">
      <span style="font-size:28px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">Pulse<span style="color:rgba(255,255,255,0.7);">RPM</span></span>
    </div>
    <div style="padding:32px;">
      <div style="text-align:center;margin-bottom:24px;">
        <div style="display:inline-flex;align-items:center;justify-content:center;width:56px;height:56px;border-radius:50%;background:#eff6ff;border:2px solid #bfdbfe;">
          <span style="font-size:26px;">🔑</span>
        </div>
      </div>
      <h2 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#0f172a;text-align:center;">Reset your password</h2>
      <p style="color:#64748b;font-size:14px;line-height:1.7;margin:0 0 28px;text-align:center;">
        Hi ${firstName}, we received a request to reset your PulseRPM password.<br>
        Enter the code below — it expires in <strong>15 minutes</strong>.
      </p>
      <div style="background:#f1f5f9;border-radius:12px;padding:28px;text-align:center;margin-bottom:28px;">
        <span style="font-size:40px;font-weight:800;letter-spacing:12px;color:#0ea5e9;font-variant-numeric:tabular-nums;">${code}</span>
      </div>
      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:14px 18px;margin-bottom:8px;">
        <p style="margin:0;color:#991b1b;font-size:13px;line-height:1.6;">
          <strong>Didn't request this?</strong> You can safely ignore this email. Your password will not change.
        </p>
      </div>
    </div>
    <div style="padding:16px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;">
      <p style="margin:0;color:#cbd5e1;font-size:11px;text-align:center;">PulseRPM · Remote Patient Monitoring · Secure &amp; HIPAA-Compliant</p>
    </div>
  </div>
</body>
</html>`;
}

export async function sendPasswordResetEmail(to: string, name: string, code: string): Promise<boolean> {
  return send(
    to,
    "Reset your PulseRPM password",
    buildPasswordResetEmailHtml(name, code),
    `password reset code for ${to}: ${code}`,
  );
}

export async function sendNewPatientPendingEmail(to: string, providerName: string, patientId: number, dashboardUrl: string): Promise<void> {
  await send(
    to,
    `New patient awaiting approval — Patient #${patientId}`,
    buildNewPatientPendingHtml(providerName, patientId, dashboardUrl),
    `new patient pending notification to ${to}`
  );
}

// ── Admin: new provider awaiting approval ─────────────────────────────────────
function buildAdminNewProviderPendingHtml(adminName: string, providerName: string, providerEmail: string, dashboardUrl: string): string {
  const lastName = adminName.split(" ").at(-1) ?? adminName;
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:480px;margin:40px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(135deg,#7c3aed 0%,#4f46e5 100%);padding:32px;text-align:center;">
      <span style="font-size:28px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">Pulse<span style="color:rgba(255,255,255,0.7);">RPM</span></span>
      <p style="margin:8px 0 0;color:rgba(255,255,255,0.8);font-size:12px;text-transform:uppercase;letter-spacing:1px;">Admin · Provider Approval Required</p>
    </div>
    <div style="padding:32px;">
      <h2 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#0f172a;">New provider awaiting approval</h2>
      <p style="color:#64748b;font-size:14px;line-height:1.7;margin:0 0 24px;">
        Dear ${lastName}, a new healthcare provider has verified their email and is waiting for admin approval to access PulseRPM.
      </p>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="padding:6px 0;color:#94a3b8;font-size:13px;width:80px;">Name</td>
            <td style="padding:6px 0;color:#0f172a;font-size:14px;font-weight:600;">${providerName}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#94a3b8;font-size:13px;">Email</td>
            <td style="padding:6px 0;color:#0f172a;font-size:14px;">${providerEmail}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#94a3b8;font-size:13px;">Status</td>
            <td style="padding:6px 0;">
              <span style="display:inline-block;padding:2px 10px;border-radius:20px;background:#fef9c3;color:#854d0e;font-size:12px;font-weight:600;">Pending Admin Approval</span>
            </td>
          </tr>
        </table>
      </div>
      <div style="text-align:center;">
        <a href="${dashboardUrl}" style="display:inline-block;background:#7c3aed;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:600;">Review in Super Admin</a>
      </div>
    </div>
    <div style="padding:16px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;">
      <p style="margin:0;color:#cbd5e1;font-size:11px;text-align:center;">PulseRPM · Admin Notification · Secure &amp; HIPAA-Compliant</p>
    </div>
  </div>
</body>
</html>`;
}

export async function sendAdminNewProviderPendingEmail(to: string, adminName: string, providerName: string, providerEmail: string, dashboardUrl: string): Promise<void> {
  await send(
    to,
    `New provider awaiting approval — ${providerName}`,
    buildAdminNewProviderPendingHtml(adminName, providerName, providerEmail, dashboardUrl),
    `new provider pending notification to ${to}`
  );
}

// ── Provider approved email ───────────────────────────────────────────────────
function buildProviderApprovedHtml(providerName: string, loginUrl: string): string {
  const firstName = providerName.split(" ")[0];
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:480px;margin:40px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(135deg,#0ea5e9 0%,#0284c7 100%);padding:32px;text-align:center;">
      <span style="font-size:28px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">Pulse<span style="color:rgba(255,255,255,0.7);">RPM</span></span>
    </div>
    <div style="padding:32px;">
      <div style="text-align:center;margin-bottom:24px;">
        <div style="display:inline-flex;align-items:center;justify-content:center;width:56px;height:56px;border-radius:50%;background:#dcfce7;">
          <span style="font-size:26px;">✓</span>
        </div>
      </div>
      <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#0f172a;text-align:center;">You're approved, ${firstName}!</h2>
      <p style="color:#64748b;font-size:14px;line-height:1.7;margin:0 0 28px;text-align:center;">
        Your PulseRPM provider account has been approved by the system administrator.<br>
        You can now log in and start monitoring patients.
      </p>
      <div style="text-align:center;margin-bottom:28px;">
        <a href="${loginUrl}" style="display:inline-block;background:#0ea5e9;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:600;">Log In to PulseRPM</a>
      </div>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px 20px;">
        <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#475569;">You can now:</p>
        <ul style="margin:0;padding-left:18px;color:#64748b;font-size:13px;line-height:1.8;">
          <li>Monitor patient vitals in real time</li>
          <li>Receive and acknowledge patient alerts</li>
          <li>Approve and manage patient accounts</li>
          <li>View audit logs and security reports</li>
        </ul>
      </div>
    </div>
    <div style="padding:16px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;">
      <p style="margin:0;color:#cbd5e1;font-size:11px;text-align:center;">PulseRPM · Remote Patient Monitoring · Secure &amp; HIPAA-Compliant</p>
    </div>
  </div>
</body>
</html>`;
}

export async function sendProviderApprovedEmail(to: string, providerName: string, loginUrl: string): Promise<void> {
  await send(
    to,
    "Your PulseRPM provider account has been approved!",
    buildProviderApprovedHtml(providerName, loginUrl),
    `provider approval email to ${to}`
  );
}
