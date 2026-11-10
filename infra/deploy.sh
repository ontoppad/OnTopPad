#!/usr/bin/env bash
# Usage: infra/deploy.sh testnet|mainnet
# Builds locally and ships only build output to the VPS; nothing is compiled or installed on the server.
set -euo pipefail
cd "$(dirname "$0")/.."
NET="$1"
case "$NET" in
  testnet) HOST=testnet.ontoppad.com; PORT=3501; MIN_HOLD_USD=0.0001; KEEPER=900; UPLOADS=30 ;;
  mainnet) HOST=ontoppad.com; PORT=3601; MIN_HOLD_USD=1; KEEPER=14400; UPLOADS=10 ;;
  *) echo "network must be testnet or mainnet" >&2; exit 1 ;;
esac
VPS="${VPS:-root@160.238.36.55}"
SSH="ssh -i $HOME/.ssh/ontoppad_vps -o BatchMode=yes"
DIR=/opt/ontoppad/$NET

pnpm install --frozen-lockfile
VITE_NETWORK=$NET pnpm --filter @ontoppad/web build
pnpm --filter @ontoppad/api build

$SSH "$VPS" 'bash -s' < infra/setup-vps.sh
rsync -az --delete -e "$SSH" apps/web/dist/ "$VPS:$DIR/web/"
rsync -az -e "$SSH" apps/api/dist/server.mjs "$VPS:$DIR/api/server.mjs"

# service.env holds the keeper key: written root-only through stdin, never echoed or put on a command line
set -a; . ./.secrets/deployer.env; set +a
printf 'NETWORK=%s\nHOST=172.16.0.1\nPORT=%s\nWEB_DIR=%s/web\nDATA_DIR=%s/data\nPUBLIC_URL=https://%s\nKEEPER_INTERVAL_SEC=%s\nMIN_HOLD_USD=%s\nUPLOADS_PER_HOUR=%s\nPRIVATE_KEY=%s\n' \
  "$NET" "$PORT" "$DIR" "$DIR" "$HOST" "$KEEPER" "$MIN_HOLD_USD" "$UPLOADS" "$PRIVATE_KEY" |
  $SSH "$VPS" "umask 077 && cat > $DIR/service.env"

$SSH "$VPS" "cat > /etc/systemd/system/ontoppad@.service" < infra/systemd/ontoppad@.service
$SSH "$VPS" "systemctl daemon-reload && systemctl enable ontoppad@$NET >/dev/null 2>&1 && systemctl restart ontoppad@$NET"
$SSH "$VPS" "cat > /data/coolify/proxy/dynamic/ontoppad.yaml" < infra/traefik/ontoppad.yaml

for i in $(seq 1 20); do
  $SSH "$VPS" "curl -fsS http://172.16.0.1:$PORT/api/health" >/dev/null 2>&1 && break
  sleep 1
done
$SSH "$VPS" "systemctl is-active ontoppad@$NET"
echo "deployed $NET → https://$HOST"
