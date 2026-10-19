# Clerk and Google sign-in setup

The app supports Clerk as an optional authentication mode. The Google button appears on Clerk's sign-in and sign-up screens after the Google social connection is enabled. The API and collaboration socket both verify Clerk sessions. Editorial keeps its existing email-derived user IDs so documents and invitations created with the same email stay accessible.

## Local development

1. Create a Clerk application named **Editorial**. Enable Google in Clerk Dashboard → SSO connections → Add connection → For all users. Clerk development instances use shared Google OAuth credentials.
2. Copy Clerk's publishable key to `frontend/.env` as `VITE_CLERK_PUBLISHABLE_KEY` and its secret key to `backend/.env` as `CLERK_SECRET_KEY`. Set `VITE_AUTH_PROVIDER=clerk` in the frontend only after the backend secret is configured. The publishable key alone does not switch the app to Clerk.
3. Set `CLERK_AUTHORIZED_PARTIES=http://localhost:5173` in `backend/.env`. Keep `CLIENT_URL` pointed at the same frontend origin.
4. Start both apps and sign in at `/login`. Use an account with a verified primary email address.

Set both Clerk keys before using the Clerk flow. Without them, the existing email/password flow remains active.

The login and registration pages always display the Google sign-in button. In legacy mode it is disabled with a setup notice. In Clerk mode it starts Google OAuth directly and uses `/sso-callback` to finish any additional sign-up or verification steps. Deploy the backend Clerk changes and configure its secret before activating `VITE_AUTH_PROVIDER=clerk`.

## Production Google OAuth

1. In Clerk Dashboard → SSO connections → Google, enable sign-up and sign-in and **Use custom credentials**. Copy the Authorized Redirect URI shown by Clerk.
2. In Google Cloud Console, create or select the project for Editorial. Open Google Auth Platform → **Branding**. Set the app name to **Editorial**, choose a support email you control, and use these public links: home page `https://editorial.justshivamm.in/about.html`, privacy policy `https://editorial.justshivamm.in/privacy.html`, terms of service `https://editorial.justshivamm.in/terms.html`. Use the optimized `frontend/public/logo.png` (under 1 MB) for the logo upload.
3. Open **Audience**. Choose **Internal** if only users in your Google Workspace organization should sign in; choose **External** for a public or cross-organization product. During external testing, configure test users as needed. Publish the app when ready for its intended audience.
4. Open **Clients** (or APIs & Services → Credentials) and create a **Web application** OAuth client. Add `https://editorial.justshivamm.in` under Authorized JavaScript origins. Paste Clerk's Authorized Redirect URI exactly under Authorized redirect URIs. The redirect is a Clerk URL and cannot be derived from the Editorial site URL.
5. Copy the Google Client ID and Client Secret into the Clerk Google connection. Keep the Client Secret in Clerk; do not add it to this repository or a `VITE_` variable.
6. In production hosting, set the frontend Clerk publishable key, backend Clerk secret key, and `CLERK_AUTHORIZED_PARTIES` to the exact production frontend origin. Then set `VITE_AUTH_PROVIDER=clerk` and deploy both services. Add any preview origins explicitly as comma-separated values. Test sign-in, API requests, and opening a shared document with a second account.

Google Cloud Shell authorization is for running Google Cloud tools. It is separate from signing in to Editorial. If you use Cloud Shell to manage the Google project, authorize Cloud Shell when prompted; the OAuth Branding, Audience, and client settings still belong to the Google Cloud project.

References: [Clerk Google setup](https://clerk.com/docs/guides/configure/auth-strategies/social-connections/google), [Google Branding setup](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid), [Google OAuth app state](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview), [Cloud Shell authorization](https://docs.cloud.google.com/shell/docs/auth).
