# Secrets Rotation & Incident Response

If secrets are exposed, follow these steps immediately:

1. Revoke the exposed keys:
   - Clerk: rotate/revoke API keys in the Clerk dashboard.
   - Supabase: revoke the service role key and create a new one.
   - SMTP (Gmail): revoke the App Password and create a new one, or rotate API keys for SendGrid.
   - Redis: rotate credentials or replace instances if URL/credentials leaked.

2. Remove secrets from repository history (already performed):
   - Remove files from index and rewrite history (`git filter-repo` or `git filter-branch`).
   - Force-push rewritten branches and notify collaborators to re-clone.

3. Update deployments and CI with new secrets:
   - Update GitHub Actions Secrets, Kubernetes secrets, or cloud secrets stores.
   - Redeploy services with new secrets.

4. Verify functionality:
   - Run a smoke test: send a test email, run a Supabase admin API check, connect to Redis.

5. Post-incident:
   - Document the incident and rotation steps in this file.
   - Add pre-commit hooks and repository secret scanning to prevent future leaks.
