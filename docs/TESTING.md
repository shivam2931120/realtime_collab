# Testing

Test suites and how to run them locally and in CI.

Unit tests
- Frontend: Vitest + Testing Library. Run in `frontend`:

```bash
cd frontend
npm ci
npm run test
```

Integration / Mocking
- Use MSW handlers in `frontend/test/mswHandlers.ts` for predictable API responses in unit/integration tests.

E2E
- Playwright is configured under `tests/e2e`. Run locally with:

```bash
npx playwright test
```

Load tests
- Artillery scripts are available under `tests/load` for basic load testing.

CI
- CI runs lint, typecheck, unit tests, and E2E on merge to `main`. Ensure CI has required secrets for E2E (test accounts) stored in secrets manager.

Test data
- Use a dedicated test Supabase project or ephemeral databases for CI to avoid polluting production data.
