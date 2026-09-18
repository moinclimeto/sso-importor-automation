#!/usr/bin/env bash
# One-time folder setup on VPS (nginx already configured in api.climeto.in).
#
# Existing nginx block (no changes needed):
#   location ^~ /desktop/stable/ {
#       alias /var/www/downloads/desktop/stable/;
#   }
#
# Public URL:
#   https://api.climeto.in/desktop/stable/latest.yml

set -euo pipefail

RELEASE_DIR="/var/www/downloads/desktop/stable"

echo "[vps-setup] Creating release directory..."
mkdir -p "$RELEASE_DIR/archive"
chown -R www-data:www-data /var/www/downloads
chmod -R 755 /var/www/downloads

echo ""
echo "[vps-setup] Done: $RELEASE_DIR"
echo "Nginx: already configured at /desktop/stable/ in api.climeto.in"
echo "Test after first publish:"
echo "  curl https://api.climeto.in/desktop/stable/latest.yml"
