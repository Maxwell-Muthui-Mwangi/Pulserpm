import app from "./app";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);

  // Email transport diagnostics — helps pinpoint delivery configuration issues
  const resendKey   = !!process.env.RESEND_API_KEY;
  const resendFrom  = process.env.RESEND_FROM_EMAIL ?? "(not set)";
  const smtpUser    = process.env.SMTP_USER;
  const smtpPass    = !!process.env.SMTP_PASS;
  const smtpHost    = process.env.SMTP_HOST ?? "(auto-detect)";
  const smtpDomain  = smtpUser ? smtpUser.split("@")[1] ?? "?" : "(not set)";

  console.log("[email] Config check —");
  console.log(`  Resend API key: ${resendKey ? "✓ set" : "✗ missing"}`);
  console.log(`  Resend from:    ${resendFrom}`);
  console.log(`  SMTP user:      ${smtpUser ? `✓ set (@${smtpDomain})` : "✗ missing"}`);
  console.log(`  SMTP pass:      ${smtpPass ? "✓ set" : "✗ missing"}`);
  console.log(`  SMTP host:      ${smtpHost}`);
  if (!resendKey && !smtpUser) {
    console.warn("[email] ⚠  No email transport configured — verification codes will only appear as fallback in API responses.");
  }
});
