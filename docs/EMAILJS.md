# EmailJS Mailer

Purpose
- EmailJS is used for document share emails, comment mention emails, and password reset emails.
- The backend sends emails with the EmailJS REST API so EmailJS keys are never exposed to the frontend.

EmailJS template
- Create one EmailJS template.
- Set the template `To Email` field to `{{to_email}}`.
- Set the template `Subject` field to `{{subject}}`.
- Set the template HTML/content body to:

```html
{{{html_message}}}
```

Configuration
- Fill values in `backend/.env` locally or Render environment variables in production:

```env
EMAILJS_SERVICE_ID=service_xxxxxxx
EMAILJS_TEMPLATE_ID=template_xxxxxxx
EMAILJS_PUBLIC_KEY=your_public_key
EMAILJS_PRIVATE_KEY=your_private_key
EMAILJS_FROM_NAME=Editorial
EMAILJS_REPLY_TO=
EMAILJS_MIN_INTERVAL_MS=1100
```

Checks

```bash
cd backend
npm run email:check
npm run email:test -- recipient@example.com
npm run email:history
```

Security
- Store EmailJS keys in a secrets manager. Do not commit `backend/.env`.
- Keep EmailJS keys only in Render/backend environment variables, not Vercel/frontend variables.
