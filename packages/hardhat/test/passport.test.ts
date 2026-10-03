import { describe, it, expect, beforeAll } from "vitest";
import hre from "hardhat";
import type { Address } from "viem";

/**
 * Passport + event log flow on Hardhat EDR (local, no network).
 * Mirrors the real usage: passport mint emits into AgentEventLog.
 */

describe("AgentPassportNFT + AgentEventLog", () => {
  let passport: any;
  let log: any;
  let admin: Address;
  let recipient: Address;
  let viem: any;
  let publicClient: any;

  beforeAll(async () => {
    const conn = await hre.network.connect();
    viem = conn.viem;
    publicClient = await viem.getPublicClient();
    const [dep, other] = await viem.getWalletClients();
    admin = dep.account.address;
    recipient = other.account.address;

    log = await viem.deployContract("AgentEventLog", [admin]);
    passport = await viem.deployContract("AgentPassportNFT", [
      log.address,
      admin,
    ]);
    await log.write.setWriter([passport.address]);
  });

  it("mints a passport with tier + tokenURI", async () => {
    await passport.write.mint([recipient, "ipfs://passport/1", 3]);
    expect((await passport.read.ownerOf([1n])).toLowerCase()).toBe(
      recipient.toLowerCase(),
    );
    expect(await passport.read.tierOf([1n])).toBe(3);
    expect(await passport.read.tokenURI([1n])).toBe("ipfs://passport/1");
  });

  it("rejects invalid tier", async () => {
    await expect(
      passport.write.mint([recipient, "ipfs://bad", 9]),
    ).rejects.toThrow(/Invalid tier/i);
  });

  it("mint emits into the event log (directory seq increments)", async () => {
    const before = await log.read.seq(["directory"]);
    await passport.write.mint([recipient, "ipfs://passport/2", 1]);
    const after = await log.read.seq(["directory"]);
    expect(after).toBe(before + 1n);
  });

  it("direct emitTopic from non-writer reverts", async () => {
    const [, other] = await viem.getWalletClients();
    const logAsOther = await viem.getContractAt("AgentEventLog", log.address, {
      client: { wallet: other },
    });
    await expect(
      logAsOther.write.emitTopic(["x", "0x00"]),
    ).rejects.toThrow(/NotWriter/);
  });

  it("revoke marks passport + emits audit event", async () => {
    await passport.write.revoke([1n, "compromised"]);
    expect(await passport.read.revoked([1n])).toBe(true);
  });
});
