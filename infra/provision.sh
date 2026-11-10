#!/usr/bin/env bash
# One-time VPS setup (Ubuntu/Debian, run as root): Node 24, nginx, certbot, firewall, service user, folders.
set -euo pipefail

apt-get update -y
apt-get install -y --no-install-recommends ca-certificates curl gnupg nginx certbot python3-certbot-nginx rsync ufw

if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 24 ]; then
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
  apt-get install -y nodejs
fi

id ontop >/dev/null 2>&1 || useradd --system --home /srv/ontoppad --shell /usr/sbin/nologin ontop
for net in testnet mainnet; do
  install -d -o ontop -g ontop -m 750 /srv/ontoppad/$net/data
  install -d -o root -g root -m 755 /srv/ontoppad/$net/web /srv/ontoppad/$net/api
done
# nginx serves uploaded media straight from the data folder
chmod 755 /srv/ontoppad /srv/ontoppad/*/ && install -d -o ontop -g ontop -m 755 /srv/ontoppad/testnet/data/media /srv/ontoppad/mainnet/data/media
chmod 755 /srv/ontoppad/testnet/data /srv/ontoppad/mainnet/data

ufw allow OpenSSH && ufw allow 'Nginx Full' && ufw --force enable
systemctl enable --now nginx
echo "provisioned: node $(node -v), nginx $(nginx -v 2>&1 | cut -d/ -f2)"
