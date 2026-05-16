# Release & Tagging

Steps to prepare a release branch and create a release tag.

1. Create release branch:

```bash
git checkout -b release/vX.Y.Z
```

2. Update `CHANGELOG.md` with notable changes for the release.

3. Run builds and tests locally:

```bash
cd frontend && npm ci && npm run build && npm run test
cd ../backend && npm ci && npm run build
```

4. Build Docker images (optional):

```bash
docker build -t myorg/realtime-collab:vX.Y.Z -f backend/Dockerfile backend
docker build -t myorg/realtime-collab-frontend:vX.Y.Z -f frontend/Dockerfile frontend
```

5. Push branch and open PR to `main`. After merge, tag a release:

```bash
git checkout main
git pull
git tag -a vX.Y.Z -m "Release vX.Y.Z"
git push origin vX.Y.Z
```

For this repo, releases are manual: build locally, push the branch, merge, then create the tag.
