// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "./EntryPoint.sol"; // 假設你與 EntryPoint 在同個目錄下

contract SimpleWallet {
    using MessageHashUtils for bytes32;

    address public owner;
    address public entryPoint;
    uint256 public nonce;

    constructor(address _owner, address _entryPoint) {
        owner = _owner;
        entryPoint = _entryPoint;
    }

    function validateUserOp(
        EntryPoint.UserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 /* missingFunds */
    ) external returns (uint256 validUntil, uint256 validAfter) {
        require(msg.sender == entryPoint, "Caller is not EntryPoint");
        require(userOp.nonce == nonce, "Invalid nonce");

        // 驗證簽章：hash 需轉成符合 signMessage() 的格式
        address recovered = ECDSA.recover(userOpHash.toEthSignedMessageHash(), userOp.signature);
        require(recovered == owner, "Invalid signature");

        nonce++; // 驗證成功後增加 nonce
        return (type(uint256).max, 0); // 永久有效
    }

    function execute(address target, bytes calldata data) external {
        require(msg.sender == entryPoint || msg.sender == owner, "Not authorized");
        (bool success, ) = target.call(data);
        require(success, "Call failed");
    }

    receive() external payable {}
}
