#!/usr/bin/env bash
# Usage: script/deploy.sh testnet|mainnet   (reads PRIVATE_KEY from ../.secrets/deployer.env, or mainnet-deployer.env on mainnet)
set -euo pipefail
cd "$(dirname "$0")/.."
NETWORK="$1"
case "$NETWORK" in
  testnet) RPC=robinhood_testnet; CHAIN=46630; EXPLORER=https://explorer.testnet.chain.robinhood.com/api/; KEY=deployer ;;
  # mainnet's Blockscout API sits behind a Cloudflare challenge that refuses scripts: verify on Sourcify, which Blockscout reads
  mainnet) RPC=robinhood; CHAIN=4663; EXPLORER=sourcify; KEY=mainnet-deployer ;;
  *) echo "network must be testnet or mainnet" >&2; exit 1 ;;
esac
# RPC_URL / VERIFIER_URL override the endpoints, e.g. when the local DNS can't resolve the chain's hosts
RPC="${RPC_URL:-$RPC}"
EXPLORER="${VERIFIER_URL:-$EXPLORER}"
# mainnet runs on its own wallet, never the one shared with other projects
set -a; . "../.secrets/$KEY.env"; set +a
if [ "$EXPLORER" = sourcify ]; then VERIFY=(--verifier sourcify); else VERIFY=(--verifier blockscout --verifier-url "$EXPLORER"); fi
NETWORK="$NETWORK" forge script script/Deploy.s.sol --rpc-url "$RPC" --broadcast --slow --verify "${VERIFY[@]}"
node -e '
  const fs = require("fs");
  const [file, run] = process.argv.slice(1);
  const d = JSON.parse(fs.readFileSync(file));
  const r = JSON.parse(fs.readFileSync(run)).receipts;
  d.startBlock = Math.min(...r.map((x) => Number(x.blockNumber)));
  fs.writeFileSync(file, JSON.stringify(d, null, 2) + "\n");
' "deployments/$NETWORK.json" "broadcast/Deploy.s.sol/$CHAIN/run-latest.json"
cat "deployments/$NETWORK.json"
