# Contributing & Submission Guidelines

This project uses a small, focused workflow suitable for single-maintainer and small-team submissions.

Commit style
- Use small, atomic commits.
- Start messages with a type: `feat:`, `fix:`, `chore:`, `docs:`.
- Keep body short and explain _why_ if not obvious.

Pull Request / Submission checklist
- Branch naming: `feat/`, `fix/`, `chore/`, or `release/` prefix.
- Run and pass all tests: `npm run test` in `frontend` and `backend` if available.
- Ensure `npm run build` succeeds in both `frontend` and `backend`.
- Add or update `CHANGELOG.md` with a short note.
- Include `ENV_EXAMPLE` (.env.example) changes if new env variables were added.
- Do not commit secrets. Use `.env.example`.

Weekly submission (if required)
- Create a release branch: `git checkout -b release/vX.Y.Z`.
- Run tests and builds, fix any failures.
- Update `CHANGELOG.md`.
- Push branch and open PR to `main` with verification checklist.

Pre-commit/local checks
- Add a pre-commit hook (recommended) to prevent committing secrets and to run quick lint/tests. Example using `husky` and `lint-staged`:

```json
// package.json (example)
"husky": { "hooks": { "pre-commit": "lint-staged" } },
"lint-staged": { "*.ts": ["npm run lint --silent"] }
```

- Add a basic git hook to block `.env` files in commits:

```bash
cat > .git/hooks/pre-commit <<'HOOK'
#!/bin/sh
if git diff --cached --name-only | grep -E '\.env$' >/dev/null; then
	echo "Commit aborted: remove .env files from staging."
	exit 1
fi
HOOK
chmod +x .git/hooks/pre-commit
```

Repository scanning
- Use GitHub's secret scanning or `git-secrets` locally in CI to block common secret patterns.

