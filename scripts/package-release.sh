#!/usr/bin/env bash
# Collect the installer bundles produced by `npm run tauri build` into a
# single release folder and zip them. Run from the repository root AFTER a
# successful build on the matching platform.
#
# Usage: ./scripts/package-release.sh [output-dir]
set -euo pipefail

OUT_DIR="${1:-release}"
BUNDLE="src-tauri/target/release/bundle"

mkdir -p "$OUT_DIR"

copy_if_present() {
  # copy_if_present <subdir> <pattern>
  if compgen -G "$BUNDLE/$1/$2" > /dev/null; then
    for f in "$BUNDLE/$1"/$2; do
      echo "  + $(basename "$f")"
      cp "$f" "$OUT_DIR/"
    done
  fi
}

echo "Collecting installers into $OUT_DIR:"
copy_if_present nsis "*.exe"
copy_if_present msi "*.msi"
copy_if_present deb "*.deb"
copy_if_present appimage "*.AppImage"
copy_if_present dmg "*.dmg"

if [ -n "$(ls -A "$OUT_DIR" 2>/dev/null)" ]; then
  STAMP="$(date +%Y%m%d)"
  ZIP="latex-editor-offline-installers-$STAMP.zip"
  if command -v zip > /dev/null; then
    (cd "$OUT_DIR" && zip -q "../$ZIP" ./*)
    echo "Created $ZIP"
  else
    echo "zip non trovato: gli installer restano in $OUT_DIR/"
  fi
else
  echo "Nessun installer trovato sotto $BUNDLE. Esegui prima 'npm run tauri build'."
  exit 1
fi
