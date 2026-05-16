# Testing

Test suites and how to run them locally.

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

Test data
- Use a dedicated test Supabase project or disposable database when running integration or E2E tests against real data.
