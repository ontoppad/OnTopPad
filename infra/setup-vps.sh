#!/usr/bin/env bash
# One-time, as root on the VPS. The server is shared and Coolify's Traefik owns 80/443,
# so this only adds a service user and folders; it does not touch the proxy, firewall or other apps.
set -euo pipefail
id ontop >/dev/null 2>&1 || useradd --system --home /opt/ontoppad --shell /usr/sbin/nologin ontop
for net in testnet mainnet; do
  install -d -o root -g root -m 755 /opt/ontoppad/$net /opt/ontoppad/$net/web /opt/ontoppad/$net/api
  install -d -o ontop -g ontop -m 750 /opt/ontoppad/$net/data
done
node -e 'process.exit(+process.versions.node.split(".")[0] >= 22 ? 0 : 1)' || { echo "need node >= 22.13"; exit 1; }
echo "ready: $(node -v)"
