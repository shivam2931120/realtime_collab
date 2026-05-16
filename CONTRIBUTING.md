# Contributing & Submission Guidelines

This project uses a small, focused workflow suitable for single-maintainer and small-team submissions.

Commit style
- Use small, atomic commits.
- Start messages with a type: `feat:`, `fix:`, `chore:`, `docs:`.
- Keep body short and explain _why_ if not obvious.

Pull Request / Submission checklist
- Branch naming: `feat/`, `fix/`, `chore/`, or `release/` prefix.
- Ensure `npm run build` succeeds in both `frontend` and `backend`.
- Add or update `CHANGELOG.md` with a short note.
- Include `ENV_EXAMPLE` (.env.example) changes if new env variables were added.
- Do not commit secrets. Use `.env.example`.

Weekly submission (if required)
- Create a release branch: `git checkout -b release/vX.Y.Z`.
- Run builds, fix any failures.
- Update `CHANGELOG.md`.
- Push branch and open PR to `main` with verification checklist.
