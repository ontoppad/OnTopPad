import { defineChain, type Address } from "viem";
import { deployments } from "./deployments.generated.ts";

export const robinhoodTestnet = defineChain({
  id: 46630,
  name: "Robinhood Chain Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.chain.robinhood.com"] } },
  blockExplorers: { default: { name: "Robinhood Explorer", url: "https://explorer.testnet.chain.robinhood.com" } },
  contracts: { multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" } },
  testnet: true,
});

export const robinhoodMainnet = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.mainnet.chain.robinhood.com"] } },
  blockExplorers: { default: { name: "Robinhood Explorer", url: "https://robinhoodchain.blockscout.com" } },
  contracts: { multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" } },
});

/** $ONTOP, launched outside OnTopPad on Robinhood Chain mainnet; null until it is live. */
export const ONTOP: Address | null = null;

export type NetworkName = "testnet" | "mainnet";

export interface Quote {
  symbol: string;
  address: Address;
  decimals: number;
}

/** Uniswap v4 periphery shared by both Robinhood networks. */
export const UNISWAP_V4 = {
  poolManager: "0x8366a39CC670B4001A1121B8F6A443A643e40951",
  quoter: "0x8dc178efb8111bb0973dd9d722ebeff267c98f94",
  universalRouter: "0x8876789976decbfcbbbe364623c63652db8c0904",
} as const satisfies Record<string, Address>;

const ETH: Quote = { symbol: "ETH", address: "0x0000000000000000000000000000000000000000", decimals: 18 };

export const networks = {
  testnet: {
    name: "testnet" as const,
    label: "Robinhood Testnet",
    chain: robinhoodTestnet,
    deployment: deployments.testnet,
    quotes: [ETH],
    appUrl: "https://testnet.ontoppad.com",
  },
  mainnet: {
    name: "mainnet" as const,
    label: "Robinhood Chain",
    chain: robinhoodMainnet,
    deployment: deployments.mainnet,
    quotes: [ETH],
    appUrl: "https://ontoppad.com",
  },
} satisfies Record<string, unknown>;

export type Network = (typeof networks)[keyof typeof networks];

export function getNetwork(name: string): Network {
  const n = networks[name as keyof typeof networks];
  if (!n) throw new Error(`unknown network ${name}`);
  return n;
}

export const v4QuoterAbi = [
  {
    type: "function",
    name: "quoteExactInputSingle",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          {
            name: "poolKey",
            type: "tuple",
            components: [
              { name: "currency0", type: "address" },
              { name: "currency1", type: "address" },
              { name: "fee", type: "uint24" },
              { name: "tickSpacing", type: "int24" },
              { name: "hooks", type: "address" },
            ],
          },
          { name: "zeroForOne", type: "bool" },
          { name: "exactAmount", type: "uint128" },
          { name: "hookData", type: "bytes" },
        ],
      },
    ],
    outputs: [
      { name: "amountOut", type: "uint256" },
      { name: "gasEstimate", type: "uint256" },
    ],
  },
] as const;
