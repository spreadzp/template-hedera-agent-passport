# AGENTS.md

Guide for AI coding agents working in this repo.

## Layout

- `packages/hardhat/` — Solidity contracts (AgentPassportNFT, AgentEventLog) + deploy scripts (Hardhat, Hedera testnet chainId 296, RPC https://testnet.hashio.io/api)
- `packages/app/` — Hono API + minimal HTML page (mint passport, post attestation, read via mirror node)
- `template.json` — create-scaffold-hbar manifest
- `DEPLOYMENTS.md` — testnet contract addresses + Hashscan links

## Commands

- `npm install` — install all workspaces
- `npm run deploy -w packages/hardhat` — deploy contracts to Hedera testnet
- `npm run dev` — run the API on :3100
- `npm run build` / `npm run lint` / `npm test` — per-workspace fan-out

## Conventions

- Secrets only via `.env` (see `.env.example`); never commit keys.
- Hedera testnet only. Hashscan links: `https://hashscan.io/testnet/transaction/<id>`.
