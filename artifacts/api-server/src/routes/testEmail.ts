/**
 * DEV-ONLY: Email delivery diagnostics endpoint.
 * Only available when NODE_ENV !== "production".
 * POST /api/debug/test-email  { to: "someone@example.com" }
 */
import { Router } from "express";
import { sendVerificationEmail } from "../lib/email.js";

const router = Router();

router.post("/debug/test-email", async (req, res) => {
  if (process.env.NODE_ENV === "production") {
    res.status(404).json({ error: "Not Found" });
    return;
  }

  const { to } = req.body;
  if (!to || typeof to !== "string") {
    res.status(400).json({ error: "Bad Request", message: "Provide { to: 'email@example.com' } in the request body" });
    return;
  }

  const testCode = "123456";
  console.log(`[debug/test-email] Attempting delivery to ${to}…`);
  const sent = await sendVerificationEmail(to, "Test User", testCode);

  res.json({
    success: sent,
    to,
    message: sent
      ? `Email delivered successfully to ${to}. Check your inbox.`
      : `Delivery failed. Both Resend and SMTP transports returned errors. Check server logs for details. Fallback code: ${testCode}`,
    smtpUserConfigured: !!process.env.SMTP_USER,
    smtpPassConfigured: !!process.env.SMTP_PASS,
    smtpHostConfigured: !!process.env.SMTP_HOST,
    resendKeyConfigured: !!process.env.RESEND_API_KEY,
    resendFromEmailConfigured: !!process.env.RESEND_FROM_EMAIL,
  });
});

export default router;
