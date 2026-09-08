#!/usr/bin/env bash
# ============================================================
#  Hotel Management - Linux systemd Auto-Start Installer
#  Installs and enables the hotel-web.service so the server
#  starts automatically at boot.
#
#  Usage (run as root or with sudo):
#    sudo bash install-linux-startup.sh
#
#  To remove later:
#    sudo systemctl disable --now hotel-web && sudo rm /etc/systemd/system/hotel-web.service
# ============================================================
set -euo pipefail

SERVICE_NAME="hotel-web"
PROJECT_SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST_DIR="/opt/hotel-management"
SERVICE_DEST="/etc/systemd/system/${SERVICE_NAME}.service"

echo "==> Project source : $PROJECT_SRC"
echo "==> Deploy target  : $DEST_DIR"

if [ "$PROJECT_SRC" = "$DEST_DIR" ]; then
    echo "==> Already at /opt/hotel-management, keeping in place."
else
    if [ ! -d "$DEST_DIR" ]; then
        echo "==> Copying project to $DEST_DIR ..."
        cp -r "$PROJECT_SRC" "$DEST_DIR"
    else
        echo "==> Target exists. Syncing files (excluding node_modules/.next/.git)..."
        rsync -a --delete --exclude node_modules --exclude .next --exclude .git "$PROJECT_SRC/" "$DEST_DIR/"
    fi
fi

# Install dependencies if missing
if [ ! -d "$DEST_DIR/node_modules" ]; then
    echo "==> Installing dependencies (npm ci) ..."
    (cd "$DEST_DIR" && npm ci)
fi

# Create service user if absent
if ! id "hotel" >/dev/null 2>&1; then
    echo "==> Creating 'hotel' system user..."
    useradd --system --home "$DEST_DIR" --shell /usr/sbin/nologin hotel
fi
chown -R hotel:hotel "$DEST_DIR"

# Install the systemd unit
echo "==> Installing $SERVICE_DEST ..."
cp "$PROJECT_SRC/scripts/hotel-web.service" "$SERVICE_DEST"
chown root:root "$SERVICE_DEST"

echo "==> Enabling and starting service..."
systemctl daemon-reload
systemctl enable --now "$SERVICE_NAME"

echo ""
echo "SUCCESS: service '$SERVICE_NAME' is now enabled."
echo "  - Status : systemctl status $SERVICE_NAME"
echo "  - Logs   : journalctl -u $SERVICE_NAME -f"
echo "  - Site   : http://localhost:3210"