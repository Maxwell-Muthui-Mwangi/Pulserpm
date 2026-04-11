import nodemailer from "nodemailer";
import { logger } from "./logger.js";

const TUTOR_EMAIL = "tobiasbilla@gmail.com";

function createTransporter() {
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || "587", 10),
      secure: false,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  logger.warn("No SMTP config found, emails will not be sent");
  return null;
}

export async function sendEmail(subject: string, html: string, to: string = TUTOR_EMAIL): Promise<boolean> {
  const transporter = createTransporter();
  if (!transporter) return false;
  try {
    await transporter.sendMail({ from: process.env.SMTP_USER, to, subject, html });
    logger.info({ to, subject }, "Email sent");
    return true;
  } catch (err) {
    logger.error({ err }, "Failed to send email");
    return false;
  }
}

export function buildReminderEmail(assignmentTitle: string, studentName: string, dueDate: Date, type: "48h" | "day_of" | "2h"): { subject: string; html: string } {
  const dueDateStr = dueDate.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const dueTimeStr = dueDate.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

  const subjects: Record<string, string> = {
    "48h": `Upcoming Assignment: "${assignmentTitle}" due in 48 hours`,
    "day_of": `Today's Assignment: "${assignmentTitle}" is due today`,
    "2h": `URGENT: "${assignmentTitle}" due in 2 hours!`,
  };

  const colors: Record<string, string> = { "48h": "#2563eb", "day_of": "#d97706", "2h": "#dc2626" };
  const labels: Record<string, string> = { "48h": "Starting Soon", "day_of": "Due Today", "2h": "Urgent Alert" };
  const messages: Record<string, string> = {
    "48h": `Assignment "${assignmentTitle}" for student ${studentName} is due in 48 hours.`,
    "day_of": `Assignment "${assignmentTitle}" for student ${studentName} is due today.`,
    "2h": `Assignment "${assignmentTitle}" for student ${studentName} is due in just 2 hours!`,
  };

  const html = `
    <div style="font-family: 'Georgia', serif; max-width: 600px; margin: 0 auto; background: #f8f7f4; padding: 0; border-radius: 8px; overflow: hidden;">
      <div style="background: #1e3a5f; padding: 32px; text-align: center;">
        <h1 style="color: #f5c842; margin: 0; font-size: 24px;">Academic Scheduler</h1>
        <p style="color: #94b8d4; margin: 8px 0 0 0; font-size: 14px;">Assignment Reminder</p>
      </div>
      <div style="padding: 32px;">
        <div style="background: ${colors[type]}; color: white; padding: 8px 16px; border-radius: 4px; display: inline-block; font-size: 12px; font-weight: bold; text-transform: uppercase; margin-bottom: 24px;">${labels[type]}</div>
        <h2 style="color: #1e3a5f; margin: 0 0 8px 0;">${assignmentTitle}</h2>
        <p style="color: #4b5563; margin: 0 0 24px 0;">${messages[type]}</p>
        <div style="background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px;">
          <div style="margin-bottom: 12px;"><strong>Student:</strong> ${studentName}</div>
          <div style="margin-bottom: 12px;"><strong>Due Date:</strong> ${dueDateStr}</div>
          <div><strong>Due Time:</strong> ${dueTimeStr}</div>
        </div>
      </div>
      <div style="background: #1e3a5f; padding: 16px; text-align: center;">
        <p style="color: #94b8d4; margin: 0; font-size: 12px;">Academic Assignment Scheduler — tobiasbilla@gmail.com</p>
      </div>
    </div>
  `;
  return { subject: subjects[type], html };
}

export function buildWeeklyDigestEmail(assignments: Array<{ title: string; studentName: string; dueDate: Date; priority: string }>): { subject: string; html: string } {
  const rows = assignments.map((a) => {
    const dateStr = a.dueDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    const priorityColor = a.priority === "urgent" ? "#dc2626" : a.priority === "high" ? "#f59e0b" : a.priority === "medium" ? "#3b82f6" : "#6b7280";
    return `<tr>
      <td style="padding: 12px 16px; border-bottom: 1px solid #f3f4f6; color: #1f2937;">${a.title}</td>
      <td style="padding: 12px 16px; border-bottom: 1px solid #f3f4f6; color: #6b7280;">${a.studentName}</td>
      <td style="padding: 12px 16px; border-bottom: 1px solid #f3f4f6; color: #6b7280;">${dateStr}</td>
      <td style="padding: 12px 16px; border-bottom: 1px solid #f3f4f6;"><span style="color: ${priorityColor}; font-size: 12px; font-weight: bold; text-transform: uppercase;">${a.priority}</span></td>
    </tr>`;
  }).join("");

  const html = `
    <div style="font-family: 'Georgia', serif; max-width: 600px; margin: 0 auto; background: #f8f7f4; border-radius: 8px; overflow: hidden;">
      <div style="background: #1e3a5f; padding: 32px; text-align: center;">
        <h1 style="color: #f5c842; margin: 0; font-size: 24px;">Weekly Digest</h1>
        <p style="color: #94b8d4; margin: 8px 0 0 0; font-size: 14px;">Upcoming assignments for the next 7 days</p>
      </div>
      <div style="padding: 32px;">
        <p style="color: #4b5563; margin: 0 0 24px 0;">You have <strong>${assignments.length}</strong> assignment${assignments.length !== 1 ? "s" : ""} due in the next 7 days.</p>
        <table style="width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; border: 1px solid #e5e7eb;">
          <thead><tr style="background: #f9fafb;">
            <th style="padding: 12px 16px; text-align: left; font-size: 12px; color: #374151; text-transform: uppercase;">Assignment</th>
            <th style="padding: 12px 16px; text-align: left; font-size: 12px; color: #374151; text-transform: uppercase;">Student</th>
            <th style="padding: 12px 16px; text-align: left; font-size: 12px; color: #374151; text-transform: uppercase;">Due</th>
            <th style="padding: 12px 16px; text-align: left; font-size: 12px; color: #374151; text-transform: uppercase;">Priority</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div style="background: #1e3a5f; padding: 16px; text-align: center;">
        <p style="color: #94b8d4; margin: 0; font-size: 12px;">Academic Assignment Scheduler</p>
      </div>
    </div>
  `;
  return { subject: `Weekly Digest: ${assignments.length} assignment${assignments.length !== 1 ? "s" : ""} due this week`, html };
}
