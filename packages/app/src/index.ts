import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { keccak256, toBytes, decodeEventLog } from "viem";
import {
  publicClient,
  walletClient,
  passportAbi,
  passportAddress,
  eventLogAddress,
  hashscan,
  chain,
} from "./hedera.js";

const app = new Hono();

// ── Health (bounty gate: app boots, 200) ─────────────────────────────────────
app.get("/health", (c) =>
  c.json({ ok: true, chain: chain.name, chainId: chain.id }),
);

// ── Contracts info ───────────────────────────────────────────────────────────
app.get("/contracts", (c) =>
  c.json({
    passport: passportAddress,
    eventLog: eventLogAddress,
    chainId: chain.id,
    hashscan: {
      passport: `${hashscan}/contract/${passportAddress}`,
      eventLog: `${hashscan}/contract/${eventLogAddress}`,
    },
  }),
);

// ── Mint passport NFT ────────────────────────────────────────────────────────
// POST /passport/mint { to?, uri?, tier? } — defaults: mint to operator, tier 1
app.post("/passport/mint", async (c) => {
  if (!walletClient) {
    return c.json({ error: "HEDERA_PRIVATE_KEY not configured" }, 500);
  }
  const body = await c.req.json().catch(() => ({}));
  const to = (body.to ?? walletClient.account.address) as `0x${string}`;
  const uri = body.uri ?? "ipfs://agent-passport/template";
  const tier = Number(body.tier ?? 1);
  if (!/^0x[0-9a-fA-F]{40}$/.test(to))
    return c.json({ error: "bad `to`" }, 400);
  if (tier < 1 || tier > 4) return c.json({ error: "tier must be 1-4" }, 400);

  try {
    const hash = await walletClient.writeContract({
      abi: passportAbi,
      address: passportAddress,
      functionName: "mint",
      args: [to, uri, tier],
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    return c.json({
      ok: receipt.status === "success",
      tx: hash,
      status: receipt.status,
      to,
      tier,
      hashscan: `${hashscan}/transaction/${hash}`,
    });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

// ── Attest a snapshot → writes into AgentEventLog via the contract ──────────
// POST /attestation { domain, score, grade, snapshotHash? }
app.post("/attestation", async (c) => {
  if (!walletClient) {
    return c.json({ error: "HEDERA_PRIVATE_KEY not configured" }, 500);
  }
  const body = await c.req.json().catch(() => ({}));
  const domain = String(body.domain ?? "example.com");
  const score = Number(body.score ?? 90);
  const grade = String(body.grade ?? "A");
  const snapshotHash = (body.snapshotHash ??
    keccak256(toBytes(`${domain}:${Date.now()}`))) as `0x${string}`;
  if (score < 0 || score > 100) {
    return c.json({ error: "score must be 0-100" }, 400);
  }

  try {
    const hash = await walletClient.writeContract({
      abi: passportAbi,
      address: passportAddress,
      functionName: "attestSnapshot",
      args: [snapshotHash, domain, score, grade],
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    // Extract tokenId from SnapshotAttested event if present.
    let tokenId: string | null = null;
    for (const log of receipt.logs) {
      try {
        const parsed = decodeEventLog({
          abi: [
            {
              type: "event",
              name: "SnapshotAttested",
              inputs: [
                { name: "tokenId", type: "uint256", indexed: true },
                { name: "snapshotHash", type: "bytes32", indexed: true },
                { name: "score", type: "uint8", indexed: false },
                { name: "timestamp", type: "uint64", indexed: false },
              ],
            },
          ],
          data: log.data,
          topics: log.topics,
        });
        tokenId = (parsed.args as { tokenId: bigint }).tokenId.toString();
      } catch {
        /* not our event */
      }
    }
    return c.json({
      ok: receipt.status === "success",
      tx: hash,
      status: receipt.status,
      tokenId,
      snapshotHash,
      hashscan: `${hashscan}/transaction/${hash}`,
    });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

// ── Read passport state ──────────────────────────────────────────────────────
app.get("/passport/:id", async (c) => {
  const id = BigInt(c.req.param("id"));
  try {
    const [owner, uri, tier, revoked] = await Promise.all([
      publicClient.readContract({
        abi: passportAbi,
        address: passportAddress,
        functionName: "ownerOf",
        args: [id],
      }),
      publicClient.readContract({
        abi: passportAbi,
        address: passportAddress,
        functionName: "tokenURI",
        args: [id],
      }),
      publicClient.readContract({
        abi: passportAbi,
        address: passportAddress,
        functionName: "tierOf",
        args: [id],
      }),
      publicClient.readContract({
        abi: passportAbi,
        address: passportAddress,
        functionName: "revoked",
        args: [id],
      }),
    ]);
    return c.json({
      tokenId: id.toString(),
      owner,
      tokenURI: uri,
      tier,
      revoked,
      hashscan: `${hashscan}/contract/${passportAddress}`,
    });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 404);
  }
});

// ── Verify an attestation by snapshot hash ───────────────────────────────────
app.get("/attestation/:hash", async (c) => {
  const h = c.req.param("hash") as `0x${string}`;
  try {
    const [tokenId, score, timestamp, valid] = (await publicClient.readContract(
      {
        abi: passportAbi,
        address: passportAddress,
        functionName: "verifySnapshot",
        args: [h],
      },
    )) as readonly [bigint, number, bigint, boolean];
    return c.json({
      snapshotHash: h,
      tokenId: tokenId.toString(),
      score,
      timestamp: Number(timestamp),
      valid,
    });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 404);
  }
});

// ── Minimal UI ───────────────────────────────────────────────────────────────
app.use("/", serveStatic({ path: "./public/index.html" }));

const port = Number(process.env.PORT ?? 3000);
console.log(`agent-passport API on http://localhost:${port} (${chain.name})`);
serve({ fetch: app.fetch, port });
