import {
  createPublicClient,
  createWalletClient,
  http,
  defineChain,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { config as dotenv } from "dotenv";
import { PASSPORT_CONTRACT, EVENTLOG_CONTRACT } from "../deployedContracts.js";

// Load repo-root .env BEFORE reading env vars below (module-init order).
dotenv({
  path: new URL("../../../.env", import.meta.url).pathname,
  quiet: true,
});

export const hederaTestnet = defineChain({
  id: 296,
  name: "Hedera Testnet",
  nativeCurrency: { name: "hbar", symbol: "HBAR", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://testnet.hashio.io/api"] },
  },
  blockExplorers: {
    default: { name: "Hashscan", url: "https://hashscan.io/testnet" },
  },
});

export const hederaMainnet = defineChain({
  id: 295,
  name: "Hedera Mainnet",
  nativeCurrency: { name: "hbar", symbol: "HBAR", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://mainnet.hashio.io/api"] },
  },
  blockExplorers: {
    default: { name: "Hashscan", url: "https://hashscan.io/mainnet" },
  },
});

const network = process.env.HEDERA_NETWORK ?? "testnet";
export const chain = network === "mainnet" ? hederaMainnet : hederaTestnet;
export const rpcUrl =
  process.env.HEDERA_RPC_URL ?? chain.rpcUrls.default.http[0];
export const hashscan = `https://hashscan.io/${network === "mainnet" ? "mainnet" : "testnet"}`;

export const passportAddress = (process.env.PASSPORT_CONTRACT ??
  PASSPORT_CONTRACT) as `0x${string}`;
export const eventLogAddress = (process.env.EVENTLOG_CONTRACT ??
  EVENTLOG_CONTRACT) as `0x${string}`;

export const publicClient = createPublicClient({
  chain,
  transport: http(rpcUrl),
});

const key = process.env.HEDERA_PRIVATE_KEY;
export const walletClient = key
  ? createWalletClient({
      chain,
      transport: http(rpcUrl),
      account: privateKeyToAccount(
        (key.startsWith("0x") ? key : `0x${key}`) as `0x${string}`,
      ),
    })
  : null;

/** Minimal ABI surface used by the API. */
export const passportAbi = [
  {
    type: "function",
    name: "mint",
    inputs: [
      { name: "to", type: "address" },
      { name: "uri", type: "string" },
      { name: "tier", type: "uint8" },
    ],
    outputs: [{ name: "id", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "attestSnapshot",
    inputs: [
      { name: "snapshotHash", type: "bytes32" },
      { name: "domain", type: "string" },
      { name: "score", type: "uint8" },
      { name: "grade", type: "string" },
    ],
    outputs: [{ name: "tokenId", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "ownerOf",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "tokenURI",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ type: "string" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "tierOf",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ type: "uint8" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "revoked",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "verifySnapshot",
    inputs: [{ name: "snapshotHash", type: "bytes32" }],
    outputs: [
      { name: "tokenId", type: "uint256" },
      { name: "score", type: "uint8" },
      { name: "timestamp", type: "uint64" },
      { name: "valid", type: "bool" },
    ],
    stateMutability: "view",
  },
] as const;
