# CI / CD

Overview of automated workflows and required secrets.

Workflows
- `ci.yml` (or similar): runs `lint`, `typecheck`, `build`, `test` and optionally deploy preview.
- Release workflow: builds Docker images, tags release, and publishes artifacts.

Secrets for CI
- `CLERK_SECRET_KEY` (only if backend e2e tests require it)
- `SUPABASE_SERVICE_KEY` (use a test-only service key in CI)
- `SMTP_*` if E2E tests send emails (recommended to mock or use a test SMTP)
- `REDIS_URL` if tests require Redis

Checks before merge
- Lint, typecheck, unit tests, and optionally E2E smoke tests must pass.

Deploy
- Deploy steps are implementation-specific. Use Docker images built in CI and a secure secrets store for runtime credentials.
