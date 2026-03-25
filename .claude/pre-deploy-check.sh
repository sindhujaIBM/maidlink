#!/bin/bash
# Pre-deploy hook: blocks ./deploy-services.sh if tests or frontend build fail.
# Reads Claude tool-use JSON from stdin.

cmd=$(jq -r '.tool_input.command // ""')

# Only run check when the deploy script is invoked
if ! echo "$cmd" | grep -qE 'deploy-services\.sh'; then
  exit 0
fi

ROOT="/Users/sindhuja/Desktop/maidlink"

echo "" >&2
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >&2
echo "  Pre-deploy check (tests + frontend build)" >&2
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >&2

# ── 1. Unit tests ────────────────────────────────────
echo "" >&2
echo "▶ Running unit tests..." >&2
if ! npm test --prefix "$ROOT"; then
  printf '{"continue":false,"stopReason":"Tests failed — deploy blocked. Fix failing tests and retry."}'
  exit 1
fi

# ── 2. Frontend TypeScript + Vite build ─────────────
echo "" >&2
echo "▶ Building frontend..." >&2
if ! npm run build --workspace=frontend --prefix "$ROOT"; then
  printf '{"continue":false,"stopReason":"Frontend build failed — deploy blocked. Fix build errors and retry."}'
  exit 1
fi

echo "" >&2
echo "✓ All checks passed — proceeding with deploy." >&2
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >&2
echo "" >&2
