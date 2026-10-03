import { defineConfig } from "hardhat/config";
import hardhatViem from "@nomicfoundation/hardhat-viem";
import { config as dotenv } from "dotenv";

// Repo-root .env lives two levels up from this package.
dotenv({ path: new URL("../../.env", import.meta.url).pathname, quiet: true });

export default defineConfig({
  plugins: [hardhatViem],
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      evmVersion: "cancun",
      viaIR: true,
    },
  },
  networks: {
    hederaTestnet: {
      type: "http",
      url: process.env.HEDERA_RPC_URL ?? "https://testnet.hashio.io/api",
      chainId: 296,
      accounts: process.env.HEDERA_PRIVATE_KEY
        ? [process.env.HEDERA_PRIVATE_KEY]
        : [],
    },
    hederaMainnet: {
      type: "http",
      url:
        process.env.HEDERA_MAINNET_RPC_URL ?? "https://mainnet.hashio.io/api",
      chainId: 295,
      accounts: process.env.HEDERA_PRIVATE_KEY
        ? [process.env.HEDERA_PRIVATE_KEY]
        : [],
    },
    hardhat: {
      type: "edr-simulated",
      chainId: 31337,
    },
  },
});
