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
        // 將 calldata 複製到 memory，便於排序與操作
        UserOperation[] memory sortedOps = new UserOperation[](ops.length);
        for (uint256 i = 0; i < ops.length; i++) {
            sortedOps[i] = ops[i];
        }

        // 按 meta_tx_order_id 排序（升冪）
        for (uint256 i = 0; i < sortedOps.length; i++) {
            for (uint256 j = i + 1; j < sortedOps.length; j++) {
                if (sortedOps[j].meta_tx_order_id < sortedOps[i].meta_tx_order_id) {
                    UserOperation memory temp = sortedOps[i];
                    sortedOps[i] = sortedOps[j];
                    sortedOps[j] = temp;
                }
            }
        }

        // 預設 meta_tx_id 為第 1 筆的 id
        uint256 meta_tx_id = sortedOps[0].meta_tx_id;
        bool allSuccess = true;

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

            bool opSuccess = false;
            string memory failReason = "";

            try IWallet(op.sender).validateUserOp(op, userOpHash, 0) {
                (bool callSuccess, bytes memory ret) = op.sender.call{gas: op.callGasLimit}(op.callData);
                if (callSuccess) {
                    opSuccess = true;
                } else {
                    if (ret.length >= 68) {
                        assembly {
                            ret := add(ret, 0x04)
                        }
                        failReason = abi.decode(ret, (string));
                    } else {
                        failReason = "Execution failed";
                    }
                }
            } catch Error(string memory err) {
                failReason = err;
            } catch {
                failReason = "Validation failed";
            }

            if (!opSuccess) {
                allSuccess = false;
            }

            emit UserOpHandled(op.sender, opSuccess, failReason);
        }

        emit MetaTransactionHandled(meta_tx_id, allSuccess);

        if (beneficiary != address(0)) {
            payable(beneficiary).transfer(0);
        }
    }

    receive() external payable {}
}
