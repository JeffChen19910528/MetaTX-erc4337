// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IWallet {
    function validateUserOp(
        EntryPoint.UserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 missingFunds
    ) external returns (uint256 validUntil, uint256 validAfter);
}

contract EntryPoint {
    event UserOpHandled(address indexed sender, bool success, string reason);
    event MetaTransactionHandled(uint256 indexed meta_tx_id, bool success);

    struct UserOperation {
        address sender;
        uint256 nonce;
        bytes initCode;
        bytes callData;
        uint256 callGasLimit;
        uint256 verificationGasLimit;
        uint256 preVerificationGas;
        uint256 maxFeePerGas;
        uint256 maxPriorityFeePerGas;
        bytes paymasterAndData;
        bytes signature;
        uint256 meta_tx_id;
        uint256 meta_tx_order_id;
        uint8 userOpsCount;
    }

    function handleOps(UserOperation[] calldata ops, address beneficiary) external {
        UserOperation[] memory sortedOps = new UserOperation[](ops.length);
        for (uint256 i = 0; i < ops.length; i++) {
            sortedOps[i] = ops[i];
        }

        for (uint256 i = 0; i < sortedOps.length; i++) {
            for (uint256 j = i + 1; j < sortedOps.length; j++) {
                if (sortedOps[j].meta_tx_order_id < sortedOps[i].meta_tx_order_id) {
                    UserOperation memory temp = sortedOps[i];
                    sortedOps[i] = sortedOps[j];
                    sortedOps[j] = temp;
                }
            }
        }

        uint256 meta_tx_id = sortedOps[0].meta_tx_id;

        // 使用 try/catch 呼叫內部函數，保證 ACID 原子性
        try this._processSortedOps(sortedOps, meta_tx_id, beneficiary) {
            emit MetaTransactionHandled(meta_tx_id, true);
        } catch Error(string memory err) {
            emit MetaTransactionHandled(meta_tx_id, false);
            revert(err);
        } catch {
            emit MetaTransactionHandled(meta_tx_id, false);
            revert("MetaTransaction failed");
        }
    }

    function _processSortedOps(
        UserOperation[] memory sortedOps,
        uint256 meta_tx_id,
        address beneficiary
    ) external {
        require(msg.sender == address(this), "Only self-call allowed");

        for (uint256 i = 0; i < sortedOps.length; i++) {
            UserOperation memory op = sortedOps[i];

            bytes32 userOpHash = keccak256(abi.encode(
                op.sender,
                op.nonce,
                op.initCode,
                op.callData,
                op.callGasLimit,
                op.verificationGasLimit,
                op.preVerificationGas,
                op.maxFeePerGas,
                op.maxPriorityFeePerGas,
                op.paymasterAndData,
                op.meta_tx_id,
                op.meta_tx_order_id,
                op.userOpsCount
            ));

            // 驗證與執行，任一失敗會直接 revert 整體流程
            IWallet(op.sender).validateUserOp(op, userOpHash, 0);

            (bool callSuccess, bytes memory ret) = op.sender.call{gas: op.callGasLimit}(op.callData);
            if (!callSuccess) {
                string memory failReason = ret.length >= 68 ? _decodeRevertReason(ret) : "Execution failed";
                revert(failReason);
            }

            emit UserOpHandled(op.sender, true, "");
        }

        if (beneficiary != address(0)) {
            payable(beneficiary).transfer(0); // 模擬獎勵行為
        }
    }

    function _decodeRevertReason(bytes memory ret) internal pure returns (string memory) {
        assembly {
            ret := add(ret, 0x04)
        }
        return abi.decode(ret, (string));
    }

    receive() external payable {}
}
