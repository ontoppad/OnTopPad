#!/usr/bin/env bash
# Usage: script/deploy.sh testnet|mainnet   (reads PRIVATE_KEY from ../.secrets/deployer.env)
set -euo pipefail
cd "$(dirname "$0")/.."
NETWORK="$1"
case "$NETWORK" in
  testnet) RPC=robinhood_testnet; CHAIN=46630; EXPLORER=https://explorer.testnet.chain.robinhood.com/api/ ;;
  mainnet) RPC=robinhood; CHAIN=4663; EXPLORER=https://robinhoodchain.blockscout.com/api/ ;;
  *) echo "network must be testnet or mainnet" >&2; exit 1 ;;
esac
set -a; . ../.secrets/deployer.env; set +a
NETWORK="$NETWORK" forge script script/Deploy.s.sol --rpc-url "$RPC" --broadcast --slow \
  --verify --verifier blockscout --verifier-url "$EXPLORER"
node -e '
  const fs = require("fs");
  const [file, run] = process.argv.slice(1);
  const d = JSON.parse(fs.readFileSync(file));
  const r = JSON.parse(fs.readFileSync(run)).receipts;
  d.startBlock = Math.min(...r.map((x) => Number(x.blockNumber)));
  fs.writeFileSync(file, JSON.stringify(d, null, 2) + "\n");
' "deployments/$NETWORK.json" "broadcast/Deploy.s.sol/$CHAIN/run-latest.json"
cat "deployments/$NETWORK.json"
