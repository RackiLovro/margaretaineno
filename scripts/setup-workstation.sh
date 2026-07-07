#!/usr/bin/env bash
# One-shot setup script — run on the workstation after power-on.
# Re-applies hardened config (sleep disabled, SSH key-only, fail2ban,
# storage server bound to 127.0.0.1, USB backup) + syncs the updated
# server.js with /upload-direct endpoint.
set -euo pipefail

echo "=== Margareta workstation one-shot setup ==="

# 1. Copy updated storage.nix (hardened config + sleep disabled + USB backup)
sudo cp /tmp/storage.nix /etc/nixos/storage.nix
echo "[1/4] storage.nix copied"

# 2. Copy updated server.js (with /upload-direct endpoint)
cp /tmp/server.js ~/margareta-storage/server.js
echo "[2/4] server.js synced"

# 3. Rebuild NixOS
sudo nixos-rebuild switch
echo "[3/4] NixOS rebuilt"

# 4. Verify
sleep 3
systemctl is-active margareta-storage cloudflared-margareta margareta-backup.timer
curl -s http://127.0.0.1:8787/health
echo
curl -s -m 10 https://storage.margaretainenozauvijek.com/health
echo
echo "[4/4] All verified. Workstation ready for the wedding."