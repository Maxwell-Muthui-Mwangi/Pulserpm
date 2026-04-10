import nodemailer from "nodemailer";

interface AlertEmailData {
  providerName: string;
  providerEmail: string;
  patientName: string;
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

// ── SMTP (Gmail / any SMTP provider) ────────────────────────────────────────
function createSmtpTransport() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const port = parseInt(process.env.SMTP_PORT ?? "587", 10);
  if (!host || !user || !pass) return null;
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

async function sendViaSmtp(to: string, subject: string, html: string, from: string): Promise<boolean> {
  const transport = createSmtpTransport();
  if (!transport) return false;
  try {
    await transport.sendMail({ from, to, subject, html });
    return true;
  } catch (err) {
    console.error("[email] SMTP send failed:", err);
    return false;
  }
}

// ── Unified sender ───────────────────────────────────────────────────────────
async function send(to: string, subject: string, html: string, fallbackLog: string): Promise<void> {
  // Try Resend first
  if (process.env.RESEND_API_KEY) {
    const ok = await sendViaResend(to, subject, html);
    if (ok) { console.log(`[email] Sent via Resend → ${to}`); return; }
  }

  // Try SMTP
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    const fromAddress = `"PulseRPM" <${process.env.SMTP_USER}>`;
    const ok = await sendViaSmtp(to, subject, html, fromAddress);
    if (ok) { console.log(`[email] Sent via SMTP → ${to}`); return; }
  }

  // No transport configured — log to console so dev can still test
  console.warn(`[email] No email transport configured — ${fallbackLog}`);
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
      <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">${overallSeverity} — ${data.patientName}</h1>
    </div>
    <div style="padding:28px 32px;">
      <p style="margin:0 0 20px;color:#374151;">Dear Dr. ${data.providerName.split(" ").at(-1)},</p>
      <p style="margin:0 0 24px;color:#6b7280;line-height:1.6;">
        Your patient <strong style="color:#111827;">${data.patientName}</strong> has triggered
        <strong style="color:${severityColor};">${data.alerts.length} alert${data.alerts.length !== 1 ? "s" : ""}</strong>
        that require${data.alerts.length === 1 ? "s" : ""} your immediate attention.
      </p>
      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
        <h2 style="margin:0 0 12px;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:#6b7280;">Patient Profile</h2>
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:4px 0;color:#6b7280;font-size:14px;width:140px;">Name</td><td style="padding:4px 0;color:#111827;font-size:14px;font-weight:500;">${data.patientName}</td></tr>
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
      <p style="margin:0;color:#9ca3af;font-size:12px;">This is an automated alert from PulseRPM Remote Patient Monitoring System. Time: ${new Date().toUTCString()}</p>
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
  const subject = `[${data.alerts.some((a) => a.severity === "critical") ? "CRITICAL" : "WARNING"}] Patient Alert — ${data.patientName}`;
  await send(data.providerEmail, subject, buildAlertEmailHtml(data), `skipping alert for ${data.patientName}`);
}

export async function sendVerificationEmail(to: string, name: string, code: string): Promise<void> {
  await send(to, "Verify your PulseRPM account", buildVerificationEmailHtml(name, code), `verification code for ${to}: ${code}`);
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
function buildNewPatientPendingHtml(providerName: string, patientName: string, patientEmail: string, dashboardUrl: string): string {
  const lastName = providerName.split(" ").at(-1) ?? providerName;
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
            <td style="padding:6px 0;color:#94a3b8;font-size:13px;width:80px;">Name</td>
            <td style="padding:6px 0;color:#0f172a;font-size:14px;font-weight:600;">${patientName}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#94a3b8;font-size:13px;">Email</td>
            <td style="padding:6px 0;color:#0f172a;font-size:14px;">${patientEmail}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#94a3b8;font-size:13px;">Status</td>
            <td style="padding:6px 0;">
              <span style="display:inline-block;padding:2px 10px;border-radius:20px;background:#fef9c3;color:#854d0e;font-size:12px;font-weight:600;">Pending Approval</span>
            </td>
          </tr>
        </table>
      </div>
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

export async function sendNewPatientPendingEmail(to: string, providerName: string, patientName: string, patientEmail: string, dashboardUrl: string): Promise<void> {
  await send(
    to,
    `New patient awaiting approval — ${patientName}`,
    buildNewPatientPendingHtml(providerName, patientName, patientEmail, dashboardUrl),
    `new patient pending notification to ${to}`
  );
}
