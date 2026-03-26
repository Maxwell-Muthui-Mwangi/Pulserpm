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

function createTransport() {
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

function formatVitalType(vitalType: string): string {
  const map: Record<string, string> = {
    heart_rate: "Heart Rate",
    blood_pressure: "Blood Pressure",
    spo2: "Blood Oxygen (SpO2)",
    temperature: "Body Temperature",
  };
  return map[vitalType] ?? vitalType.replace(/_/g, " ");
}

function buildEmailHtml(data: AlertEmailData): string {
  const criticalAlerts = data.alerts.filter((a) => a.severity === "critical");
  const warningAlerts = data.alerts.filter((a) => a.severity === "warning");
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
          <tr>
            <td style="padding:4px 0;color:#6b7280;font-size:14px;width:140px;">Name</td>
            <td style="padding:4px 0;color:#111827;font-size:14px;font-weight:500;">${data.patientName}</td>
          </tr>
          <tr>
            <td style="padding:4px 0;color:#6b7280;font-size:14px;">Age</td>
            <td style="padding:4px 0;color:#111827;font-size:14px;">${ageStr}</td>
          </tr>
          <tr>
            <td style="padding:4px 0;color:#6b7280;font-size:14px;">Gender</td>
            <td style="padding:4px 0;color:#111827;font-size:14px;">${genderStr}</td>
          </tr>
          <tr>
            <td style="padding:4px 0;color:#6b7280;font-size:14px;">Conditions</td>
            <td style="padding:4px 0;color:#111827;font-size:14px;">${conditionsStr}</td>
          </tr>
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
      <p style="margin:0;color:#9ca3af;font-size:12px;">
        This is an automated alert from PulseRPM Remote Patient Monitoring System.
        Time: ${new Date().toUTCString()}
      </p>
    </div>
  </div>
</body>
</html>`;
}

export async function sendAlertEmail(data: AlertEmailData): Promise<void> {
  const transport = createTransport();
  if (!transport) {
    console.log("[email] SMTP not configured — skipping email notification");
    return;
  }

  const overallSeverity =
    data.alerts.some((a) => a.severity === "critical") ? "CRITICAL" : "WARNING";

  try {
    await transport.sendMail({
      from: `"PulseRPM Alerts" <${process.env.SMTP_USER}>`,
      to: data.providerEmail,
      subject: `[${overallSeverity}] Patient Alert — ${data.patientName}`,
      html: buildEmailHtml(data),
    });
    console.log(
      `[email] Alert email sent to ${data.providerEmail} for patient ${data.patientName}`
    );
  } catch (err) {
    console.error("[email] Failed to send alert email:", err);
  }
}

export async function sendVerificationEmail(to: string, name: string, code: string): Promise<void> {
  const transport = createTransport();
  if (!transport) {
    console.log(`[email] SMTP not configured — verification code for ${to}: ${code}`);
    return;
  }
  try {
    await transport.sendMail({
      from: `"PulseRPM" <${process.env.SMTP_USER}>`,
      to,
      subject: "Verify your PulseRPM account",
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#fff;border-radius:12px;border:1px solid #e5e7eb;">
          <div style="text-align:center;margin-bottom:24px;">
            <span style="font-size:28px;font-weight:800;color:#0ea5e9;">Pulse<span style="color:#334155;">RPM</span></span>
          </div>
          <h2 style="font-size:20px;font-weight:700;color:#0f172a;margin:0 0 8px;">Verify your email address</h2>
          <p style="color:#64748b;font-size:14px;margin:0 0 24px;">Hi ${name}, welcome to PulseRPM! Use the code below to verify your email address. It expires in 15 minutes.</p>
          <div style="background:#f1f5f9;border-radius:10px;padding:24px;text-align:center;margin-bottom:24px;">
            <span style="font-size:36px;font-weight:800;letter-spacing:10px;color:#0ea5e9;">${code}</span>
          </div>
          <p style="color:#94a3b8;font-size:12px;text-align:center;">If you didn't create an account with PulseRPM, you can safely ignore this email.</p>
        </div>
      `,
    });
    console.log(`[email] Verification email sent to ${to}`);
  } catch (err) {
    console.error("[email] Failed to send verification email:", err);
  }
}
