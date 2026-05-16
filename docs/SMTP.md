# SMTP & Mailer

Purpose
- SMTP is used for document share emails and optional notifications.

Recommended provider
- Gmail (App Password) for small-scale testing, or SendGrid / Mailgun / SES for production volume and deliverability.

Configuration
- Fill values in `backend/.env` (or secrets manager): `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`.
- Use TLS (port 465) or STARTTLS (port 587) depending on provider.

Verification
- A verification script is available at `backend/scripts/verify-smtp.ts`. Run it locally after setting envs:

```bash
cd backend
node -r ts-node/register scripts/verify-smtp.ts
```

Provider notes
- Gmail: create an App Password and use that in `SMTP_PASS` (do NOT use your regular account password).
- SendGrid / Mailgun: use API keys or SMTP credentials provided by the service.

Security
- Store SMTP credentials in a secrets manager. Do not commit `backend/.env`.
