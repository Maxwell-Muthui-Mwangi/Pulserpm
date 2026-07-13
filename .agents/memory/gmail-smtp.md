---
name: Gmail SMTP for transactional email
description: How Gmail SMTP auth failures present and how to diagnose them when using nodemailer's service auto-detect.
---

When sending transactional email (verification codes, alert notifications) via Gmail SMTP with nodemailer's `service` auto-detect (inferred from the SMTP_USER domain), a wrong/expired/revoked App Password fails at auth time with `535-5.7.8 Username and Password not accepted (BadCredentials)` — this looks like a config/code bug but is actually just a bad credential. Gmail rejects the regular account password outright for SMTP; only a 16-character App Password (from myaccount.google.com → Security → App Passwords, requires 2FA) works.

**Why:** Users often believe they've already set an App Password when they've actually pasted the wrong value, a stale/revoked one, or the account password. The error message doesn't distinguish these cases.

**How to apply:** Don't trust "I already set an App Password" as confirmation it's valid — build/use a dev-only test-email endpoint (404s in production) that attempts a real send and reports success/failure, so credential problems are diagnosed by an actual auth attempt rather than assumption. Also gate providers like Resend behind having a verified from-address configured (e.g. `RESEND_FROM_EMAIL`) — the sandbox/default sender (`onboarding@resend.dev`) silently fails to deliver to arbitrary recipients, which looks like success but isn't.
