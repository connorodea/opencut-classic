#!/usr/bin/env bash
set -euo pipefail

# Repins apps/web from upstream's published "opencut-wasm" package to this
# fork's own scoped "@connorodea/opencut-wasm" package (see GOALS.md /
# COLOR_GRADING_DESIGN.md's scopes Action/UI wiring item for why: upstream's
# package has none of this fork's new Rust work -- primary/log wheels, HSL
# curves, LUT import, or the 4 scope computations -- and nothing in it
# reaches the running app without this repin).
#
# Prerequisite: `bun run publish:wasm` must have already published
# @connorodea/opencut-wasm to the registry (this script does not publish).
#
# Usage:
#   scripts/repin-opencut-wasm.sh --dry-run   # show what would change, no writes
#   scripts/repin-opencut-wasm.sh             # rewrite imports + package.json,
#                                              # bun install, verify tsc + tests

cd "$(dirname "$0")/.."

DRY_RUN=false
if [[ "${1:-}" == "--dry-run" ]]; then
	DRY_RUN=true
fi

OLD_PKG="opencut-wasm"
NEW_PKG="@connorodea/opencut-wasm"

FILES=$(grep -rl "\"${OLD_PKG}\"" apps/web/src apps/web/headless --include="*.ts" --include="*.tsx" 2>/dev/null || true)

if [[ -z "$FILES" ]]; then
	echo "No files reference \"${OLD_PKG}\" -- nothing to do (already repinned?)."
	exit 0
fi

FILE_COUNT=$(echo "$FILES" | wc -l | tr -d ' ')
echo "Found ${FILE_COUNT} file(s) importing \"${OLD_PKG}\":"
echo "$FILES" | sed 's/^/  /'

if $DRY_RUN; then
	echo
	echo "-- dry-run: diff sed would apply (no files written) --"
	for f in $FILES; do
		diff -u "$f" <(sed "s|\"${OLD_PKG}\"|\"${NEW_PKG}\"|g" "$f") || true
	done
	echo
	echo "-- dry-run: package.json dependency line that would change --"
	grep -n "\"${OLD_PKG}\":" apps/web/package.json || echo "  (not found -- check apps/web/package.json manually)"
	echo
	echo "-- dry-run: not running bun install / verification (package isn't published yet in this env) --"
	exit 0
fi

echo "Rewriting imports in ${FILE_COUNT} file(s)..."
for f in $FILES; do
	sed -i.bak "s|\"${OLD_PKG}\"|\"${NEW_PKG}\"|g" "$f"
	rm -f "${f}.bak"
done

echo "Updating apps/web/package.json..."
sed -i.bak "s|\"${OLD_PKG}\": \"[^\"]*\"|\"${NEW_PKG}\": \"^0.3.0\"|" apps/web/package.json
rm -f apps/web/package.json.bak

echo "Running bun install..."
bun install

echo "Verifying: tsc --noEmit..."
(cd apps/web && bun x tsc --noEmit)

echo "Verifying: bun test src/effects src/services..."
(cd apps/web && bun test src/effects src/services)

echo "Done. Review the diff (git status/diff), then commit."
