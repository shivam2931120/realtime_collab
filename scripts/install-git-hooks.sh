#!/usr/bin/env bash
# Installs the repository git hooks from .githooks to .git/hooks
set -euo pipefail
mkdir -p .git/hooks
cp .githooks/pre-commit .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
echo "Installed git hooks"
