// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721URIStorage} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

interface IAgentEventLog {
    function emitTopic(string calldata topic, bytes calldata payload) external;
}

/// @title AgentPassportNFT — agent identity passport (Hedera HTS analogue)
/// @notice tokenURI points to IPFS registration file (ERC-8004-compatible schema).
/// @dev Template: deployable on Hedera testnet (chainId 296) via Hashio JSON-RPC.
contract AgentPassportNFT is ERC721, ERC721URIStorage, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant REVOKER_ROLE = keccak256("REVOKER_ROLE");

    IAgentEventLog public immutable log;
    uint256 private _nextId = 1;

    /// @dev tier: 1=bronze, 2=silver, 3=gold, 4=platinum; 0 = revoked
    mapping(uint256 => uint8) public tierOf;
    mapping(uint256 => bool) public revoked;

    event PassportMinted(uint256 indexed tokenId, address indexed to, uint8 tier);
    event PassportRevoked(uint256 indexed tokenId, string reason);

    // ── Trust Snapshot Attestation ──────────────────────────────

    struct SnapshotAttestation {
        bytes32 snapshotHash;
        string domain;
        uint8 score;
        string grade;
        uint64 attestedAt;
        bool revoked;
    }

    mapping(bytes32 => uint256) public hashToToken;
    mapping(uint256 => SnapshotAttestation) public attestations;

    event SnapshotAttested(uint256 indexed tokenId, bytes32 indexed snapshotHash, uint8 score, uint64 timestamp);
    event SnapshotRevoked(uint256 indexed tokenId, string reason);

    constructor(address log_, address admin) ERC721("AgentBadge Passport", "ABP") {
        log = IAgentEventLog(log_);
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(MINTER_ROLE, admin);
        _grantRole(REVOKER_ROLE, admin);
    }

    /// @notice Mint by server operator (pays gas; x402 payment settled off-chain beforehand).
    /// @param to Recipient address
    /// @param uri IPFS URI pointing to passport metadata JSON
    /// @param tier Tier level (1=bronze, 2=silver, 3=gold, 4=platinum)
    /// @return id The token ID of the minted passport
    function mint(address to, string calldata uri, uint8 tier) external onlyRole(MINTER_ROLE) returns (uint256 id) {
        id = _nextId++;
        require(tier >= 1 && tier <= 4, "Invalid tier");
        _safeMint(to, id);
        _setTokenURI(id, uri);
        tierOf[id] = tier;
        emit PassportMinted(id, to, tier);
        log.emitTopic("directory", abi.encode("passport_issued", id, to, tier));
    }

    /// @notice Revoke a passport (marks as revoked, does not burn)
    /// @param id Token ID to revoke
    /// @param reason Revocation reason string
    function revoke(uint256 id, string calldata reason) external onlyRole(REVOKER_ROLE) {
        revoked[id] = true;
        emit PassportRevoked(id, reason);
        log.emitTopic("audit", abi.encode("passport_revoked", id, reason));
    }

    /// @notice Get passport info for a token
    /// @param id Token ID
    /// @return owner Owner address
    /// @return tier Tier level
    /// @return isRevoked Revocation status
    /// @return uri Token URI (IPFS)
    function getPassportInfo(uint256 id) external view returns (address owner, uint8 tier, bool isRevoked, string memory uri) {
        owner = ownerOf(id);
        tier = tierOf[id];
        isRevoked = revoked[id];
        uri = tokenURI(id);
    }

    function tokenURI(uint256 id) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        return super.tokenURI(id);
    }

    /// @notice Attest a Trust Snapshot (mints attestation NFT)
    /// @param snapshotHash SHA-256 hash of the trust snapshot
    /// @param domain Domain being attested
    /// @param score Readiness score (0-100)
    /// @param grade Grade letter (A-F)
    /// @return tokenId The token ID of the attestation
    function attestSnapshot(
        bytes32 snapshotHash,
        string calldata domain,
        uint8 score,
        string calldata grade
    ) external onlyRole(MINTER_ROLE) returns (uint256 tokenId) {
        require(snapshotHash != bytes32(0), "Invalid hash");
        require(hashToToken[snapshotHash] == 0, "Hash already attested");
        require(score <= 100, "Invalid score");

        tokenId = _nextId++;
        _safeMint(msg.sender, tokenId);

        attestations[tokenId] = SnapshotAttestation({
            snapshotHash: snapshotHash,
            domain: domain,
            score: score,
            grade: grade,
            attestedAt: uint64(block.timestamp),
            revoked: false
        });
        hashToToken[snapshotHash] = tokenId;

        emit SnapshotAttested(tokenId, snapshotHash, score, uint64(block.timestamp));
        log.emitTopic("trust", abi.encode("snapshot_attested", tokenId, snapshotHash, domain, score));
    }

    /// @notice Revoke a snapshot attestation
    /// @param tokenId Token ID to revoke
    /// @param reason Revocation reason string
    function revokeSnapshot(uint256 tokenId, string calldata reason) external onlyRole(REVOKER_ROLE) {
        require(attestations[tokenId].snapshotHash != bytes32(0), "No attestation");
        attestations[tokenId].revoked = true;
        emit SnapshotRevoked(tokenId, reason);
        log.emitTopic("trust", abi.encode("snapshot_revoked", tokenId, reason));
    }

    /// @notice Verify a snapshot by hash
    /// @param snapshotHash The hash to look up
    /// @return tokenId Token ID (0 if not found)
    /// @return score Attested score
    /// @return timestamp Attestation timestamp
    /// @return valid True if attested and not revoked
    function verifySnapshot(bytes32 snapshotHash)
        external
        view
        returns (uint256 tokenId, uint8 score, uint64 timestamp, bool valid)
    {
        tokenId = hashToToken[snapshotHash];
        if (tokenId == 0) {
            return (0, 0, 0, false);
        }
        SnapshotAttestation storage att = attestations[tokenId];
        return (tokenId, att.score, att.attestedAt, !att.revoked);
    }

    /// @notice Get full attestation data for a token
    /// @param tokenId Token ID
    /// @return att The full SnapshotAttestation struct
    function getAttestation(uint256 tokenId) external view returns (SnapshotAttestation memory att) {
        require(attestations[tokenId].snapshotHash != bytes32(0), "No attestation");
        return attestations[tokenId];
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC721URIStorage, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
