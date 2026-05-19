# Secrets Rotation & Incident Response

If secrets are exposed, follow these steps immediately:

1. Revoke the exposed keys:
   - Auth: rotate `AUTH_TOKEN_SECRET` and re-deploy backend.
   - Supabase: revoke the service role key and create a new one.
   - EmailJS: rotate the public and private keys in the EmailJS dashboard, then update Render environment variables.
   - Redis: rotate credentials or replace instances if URL/credentials leaked.

2. Remove secrets from repository history (already performed):
   - Remove files from index and rewrite history (`git filter-repo` or `git filter-branch`).
   - Force-push rewritten branches and notify collaborators to re-clone.

3. Update deployments with new secrets:
   - Update Render environment variables, Vercel environment variables, and any managed cloud secret stores.
   - Redeploy services with new secrets.

4. Verify functionality:
   - Run a smoke test: send a test email, run a Supabase admin API check, connect to Redis.

5. Post-incident:
   - Document the incident and rotation steps in this file.
   - Keep secrets only in managed env stores (Render/Vercel) and rotate on schedule.
