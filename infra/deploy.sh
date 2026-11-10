#!/usr/bin/env bash
# Usage: infra/deploy.sh testnet|mainnet
# Builds locally, ships only the built files to the VPS (no node_modules, no builds on the server).
set -euo pipefail
cd "$(dirname "$0")/.."
NET="$1"
case "$NET" in
  testnet) HOST=testnet.ontoppad.com; PORT=8787; MIN_HOLD_USD=0.0001; KEEPER=900 ;;
  mainnet) HOST=ontoppad.com; PORT=8788; MIN_HOLD_USD=1; KEEPER=14400 ;;
  *) echo "network must be testnet or mainnet" >&2; exit 1 ;;
esac
VPS="${VPS:-root@160.238.36.55}"
SSH="ssh -i $HOME/.ssh/ontoppad_vps -o BatchMode=yes"
DIR=/srv/ontoppad/$NET

pnpm install --frozen-lockfile
VITE_NETWORK=$NET pnpm --filter @ontoppad/web build
pnpm --filter @ontoppad/api build

rsync -az --delete -e "$SSH" apps/web/dist/ "$VPS:$DIR/web/"
rsync -az -e "$SSH" apps/api/dist/server.mjs "$VPS:$DIR/api/server.mjs"

# api.env: network settings plus the keeper key, written root-only and never echoed
set -a; . ./.secrets/deployer.env; set +a
printf 'NETWORK=%s\nPORT=%s\nDATA_DIR=%s/data\nPUBLIC_URL=https://%s\nKEEPER_INTERVAL_SEC=%s\nMIN_HOLD_USD=%s\nPRIVATE_KEY=%s\n' \
  "$NET" "$PORT" "$DIR" "$HOST" "$KEEPER" "$MIN_HOLD_USD" "$PRIVATE_KEY" |
  $SSH "$VPS" "umask 077 && cat > $DIR/api.env && chown root:root $DIR/api.env"

# nginx: HTTP-only until the certificate exists, then HTTPS with a redirect. Rewritten on every
# deploy, so the repo stays the single source of truth (certbot only issues certs, never edits config).
nginx_conf() {
  local body; body=$(sed -e "s/__NET__/$NET/g" -e "s/__PORT__/$PORT/g" infra/nginx/site.conf | sed 's/^/  /')
  echo "limit_req_zone \$binary_remote_addr zone=ontop_upload_$NET:1m rate=6r/m;"
  echo "limit_req_zone \$binary_remote_addr zone=ontop_api_$NET:10m rate=20r/s;"
  if [ "$1" = tls ]; then
    printf 'server {\n  listen 80;\n  listen [::]:80;\n  server_name %s;\n  location /.well-known/acme-challenge/ { root /var/www/html; }\n  location / { return 301 https://$host$request_uri; }\n}\n' "$HOST"
    printf 'server {\n  listen 443 ssl;\n  listen [::]:443 ssl;\n  http2 on;\n  server_name %s;\n  ssl_certificate /etc/letsencrypt/live/%s/fullchain.pem;\n  ssl_certificate_key /etc/letsencrypt/live/%s/privkey.pem;\n  ssl_protocols TLSv1.2 TLSv1.3;\n  ssl_session_cache shared:SSL_%s:10m;\n  add_header Strict-Transport-Security "max-age=31536000" always;\n%s\n}\n' "$HOST" "$HOST" "$HOST" "$NET" "$body"
  else
    printf 'server {\n  listen 80;\n  listen [::]:80;\n  server_name %s;\n  location /.well-known/acme-challenge/ { root /var/www/html; }\n%s\n}\n' "$HOST" "$body"
  fi
}
install_nginx() {
  nginx_conf "$1" | $SSH "$VPS" "cat > /etc/nginx/sites-available/ontoppad-$NET.conf && ln -sf /etc/nginx/sites-available/ontoppad-$NET.conf /etc/nginx/sites-enabled/ && rm -f /etc/nginx/sites-enabled/default && nginx -t -q && systemctl reload nginx"
}
if $SSH "$VPS" "test -f /etc/letsencrypt/live/$HOST/fullchain.pem"; then
  install_nginx tls
else
  install_nginx http
  $SSH "$VPS" "certbot certonly --webroot -w /var/www/html -d $HOST --non-interactive --agree-tos --register-unsafely-without-email --deploy-hook 'systemctl reload nginx'" \
    && install_nginx tls || echo "certificate not issued yet: point $HOST at the VPS and redeploy"
fi
$SSH "$VPS" "cat > /etc/systemd/system/ontoppad-api@.service" < infra/systemd/ontoppad-api@.service
$SSH "$VPS" "systemctl daemon-reload && systemctl enable ontoppad-api@$NET >/dev/null 2>&1 && systemctl restart ontoppad-api@$NET"

echo "deployed $NET → https://$HOST"
