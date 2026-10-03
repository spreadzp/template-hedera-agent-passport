// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title AgentEventLog — Ordered append-only event stream (HCS topic analogue)
/// @notice Mirrors Hedera Consensus Service topics for audit, directory, A2A, and market.
/// @dev Read path: ethers.queryFilter(TopicEvent) paginated by block range.
contract AgentEventLog {
    address public writer;
    mapping(string => uint64) public seq;

    event TopicEvent(string indexed topic, uint64 indexed seq, bytes payload, uint256 timestamp);

    error NotWriter();

    constructor(address writer_) {
        writer = writer_;
    }

    function setWriter(address w) external {
        require(msg.sender == writer, NotWriter());
        writer = w;
    }

    function emitTopic(string calldata topic, bytes calldata payload) external {
        if (msg.sender != writer) revert NotWriter();
        unchecked {
            seq[topic] += 1;
        }
        emit TopicEvent(topic, seq[topic], payload, block.timestamp);
    }
}
