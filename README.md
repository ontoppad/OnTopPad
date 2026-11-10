<p align="center">
  <img src="apps/web/public/brand/logo-256.webp" width="128" alt="ONTOPPAD" />
</p>

<h1 align="center">ONTOPPAD</h1>
<p align="center"><b>Start ahead. Stay paid.</b><br/>Every bonus and payout, public and verifiable.</p>

A token launchpad on Robinhood Chain where every buyer starts a step ahead, and every holder is paid automatically from trading activity, with every number public and checkable.

| Pillar | Message | Proof point |
| --- | --- | --- |
| **Ahead from block one** | You don't start from zero. You start with an edge. | Bonus shown in the quote before every buy |
| **Paid for patience** | Not for the fastest. For the ones who stay. | Time-weighted payout tiers |
| **Proof, not promises** | Every bonus and payout is public and checkable. | Public rewards dashboard + wallet lookup |

- Testnet: https://testnet.ontoppad.com
- X: https://x.com/OnTopPad

## How it works

Every launch is a fixed-supply ERC-20 (1,000,000,000) dropped straight into a Uniswap v4 pool that runs the OnTop hook.

- **93%** of supply is single-sided liquidity owned by `OnTopLaunchpad`. There is no function that removes it.
- **7%** is the bonus treasury, held by `OnTopHook`. On every buy the hook pays `bonusBps` (3–9%, fixed at launch) of the tokens bought, in the same transaction.
- The pool's LP fee is derived from the bonus: `(1 − fee) × (1 + bonus) ≥ 1.01`, so a buyer always starts at least 1% ahead of the pre-trade price, while a buy→sell round trip always loses (fuzz-tested).
- Fees on the pair-asset side split **75% holders / 15% creator / 10% platform**. Token-side fees refill the treasury back to its starting size; the rest is burned.
- Holder payouts are pushed by `OnTopDistributor` in rounds. Weight = balance × hold-time multiplier (**1×** under 3 days, **1.5×** from 3 days, **2×** from 7 days). Every round commits its snapshot block and an inputs hash on-chain. Payments a wallet can't receive are parked for it to claim.

```
wallet ──buy──▶ OnTopRouter ──unlock/swap──▶ PoolManager (Uniswap v4)
                                                │ afterSwap
                                                ▼
                                           OnTopHook ──bonus──▶ wallet
LP fees ──collect──▶ OnTopLaunchpad ──75%──▶ OnTopDistributor ──rounds──▶ holders
                                    ├─15%──▶ creator
                                    └─10%──▶ platform
```

## Contracts

| Contract | Robinhood Chain Testnet (46630) |
| --- | --- |
| OnTopLaunchpad | [`0x77426e21dD29D50ae61D4FB410d17B9389AF982f`](https://explorer.testnet.chain.robinhood.com/address/0x77426e21dD29D50ae61D4FB410d17B9389AF982f) |
| OnTopHook | [`0xFedFbC1cB4668D9685Dd46815793855e29Fa2840`](https://explorer.testnet.chain.robinhood.com/address/0xFedFbC1cB4668D9685Dd46815793855e29Fa2840) |
| OnTopRouter | [`0x021eC4faf62f071924f1c85d3E9D47448a75CF89`](https://explorer.testnet.chain.robinhood.com/address/0x021eC4faf62f071924f1c85d3E9D47448a75CF89) |
| OnTopDistributor | [`0x7d8b2c229c36884a8ac3f1BE469E06a3395035C5`](https://explorer.testnet.chain.robinhood.com/address/0x7d8b2c229c36884a8ac3f1BE469E06a3395035C5) |
| Uniswap v4 PoolManager | `0x8366a39CC670B4001A1121B8F6A443A643e40951` |

All OnTop contracts are verified on the explorer.

## Repository

```
apps/web          Vite + React app (landing, arcade, token pages, launch wizard, rewards)
apps/api          Indexer + REST API + payout keeper (Node, Hono, SQLite, viem)
packages/shared   Chain config, ABIs, fee/tier math shared by web and api
contracts         Foundry project: OnTopLaunchpad, OnTopHook, OnTopRouter, OnTopDistributor, OnTopToken
infra             VPS provisioning, nginx, systemd, deploy script
```

Branches: `main` (development), `testnet` (what runs on testnet.ontoppad.com), `mainnet` (what runs on ontoppad.com).

## Develop

Requirements: Node 24, pnpm 10, Foundry.

```bash
pnpm install
pnpm contracts:test                    # forge tests, fuzzed
pnpm test                              # shared math + api tests
cp apps/api/.env.example apps/api/.env # then: node --env-file=.env ...
pnpm dev                               # api on :8787, web on :5173 (proxies /api)
```

Contracts:

```bash
cd contracts
forge test
script/deploy.sh testnet               # deploys, verifies on Blockscout, writes deployments/testnet.json
cd .. && pnpm contracts:sync           # copies ABIs + addresses into packages/shared
```

## Deploy

```bash
infra/provision.sh                     # once, on the VPS
infra/deploy.sh testnet                # builds locally, ships dist + api bundle, issues TLS, restarts
```

Secrets live in `.secrets/` (git-ignored) and are written to the server as a root-only env file.

## License

Apache-2.0
