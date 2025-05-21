const ethers = require("ethers");
const axios = require("axios");
const fs = require("fs");
require("dotenv").config(); // ⬅️ 載入 .env 中的 PRIVATE_KEY

async function main() {
    const RPC_URL = "http://localhost:8545";
    const provider = new ethers.JsonRpcProvider(RPC_URL);

    // 讀取部署資訊
    const deployInfo = JSON.parse(fs.readFileSync("deploy.json"));
    const ENTRY_POINT_ADDRESS = deployInfo.entryPoint;
    const COUNTER_ADDRESS = deployInfo.counter;
    const SIMPLE_WALLET_ADDRESS = deployInfo.wallet;

    // 使用 .env 中的私鑰產生 signer
    const signer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

    // 建立合約介面
    const counterIface = new ethers.Interface(["function increase()", "function decrease()"]);
    const walletIface = new ethers.Interface(["function execute(address target, bytes data)"]);
    const simpleWalletIface = new ethers.Interface(["function nonce() view returns (uint256)"]);
    const simpleWallet = new ethers.Contract(SIMPLE_WALLET_ADDRESS, simpleWalletIface, provider);

    // 轉換 calldata
    const increaseData = counterIface.encodeFunctionData("increase");
    const decreaseData = counterIface.encodeFunctionData("decrease");

    const walletCallData = {
        increase: walletIface.encodeFunctionData("execute", [COUNTER_ADDRESS, increaseData]),
        decrease: walletIface.encodeFunctionData("execute", [COUNTER_ADDRESS, decreaseData])
    };

    // ✅ 正確從 SimpleWallet 合約中取得 nonce
    const nonceStart = await simpleWallet.nonce();

    // 模擬多筆不同手續費的操作
    const actions = [
        { action: "increase", fee: 10_000_000_000 },
        { action: "decrease", fee: 9_000_000_000 },
        { action: "decrease", fee: 8_000_000_000 },
        { action: "decrease", fee: 7_000_000_000 },
        { action: "decrease", fee: 8_000_000_000 }
    ];

    // 共用欄位
    const baseUserOp = {
        sender: SIMPLE_WALLET_ADDRESS,
        initCode: "0x",
        callGasLimit: ethers.toBeHex(150000),
        verificationGasLimit: ethers.toBeHex(150000),
        preVerificationGas: ethers.toBeHex(20000),
        maxPriorityFeePerGas: ethers.toBeHex(1e9),
        paymasterAndData: "0x",
        signature: "0x"
    };

    const meta_tx_id = Date.now(); // or use a random number
    for (let i = 0; i < actions.length; i++) {
        const { action, fee } = actions[i];

        const userOp = {
            ...baseUserOp,
            nonce: ethers.toBeHex(nonceStart + BigInt(i)), // ✅ 正確累加 nonce
            callData: walletCallData[action],
            maxFeePerGas: ethers.toBeHex(fee),

             // ✅ 加入 Meta-TX 相關欄位
            meta_tx_id: meta_tx_id,
            meta_tx_order_id: i,
            userOpsCount: actions.length
        };

        // ✅ Step 1: 建立 userOpHash（需與 Solidity 端一致）
        const userOpHash = ethers.keccak256(
            ethers.AbiCoder.defaultAbiCoder().encode(
                [
                    "address", "uint256", "bytes", "bytes",
                    "uint256", "uint256", "uint256",
                    "uint256", "uint256", "bytes",
                    "uint256", "uint256", "uint8"
                ],
                [
                    userOp.sender,
                    BigInt(userOp.nonce),
                    userOp.initCode,
                    userOp.callData,
                    BigInt(userOp.callGasLimit),
                    BigInt(userOp.verificationGasLimit),
                    BigInt(userOp.preVerificationGas),
                    BigInt(userOp.maxFeePerGas),
                    BigInt(userOp.maxPriorityFeePerGas),
                    userOp.paymasterAndData,
                    userOp.meta_tx_id,
                    userOp.meta_tx_order_id,
                    userOp.userOpsCount
                ]
            )
        );

        // ✅ Step 2: 進行符合 toEthSignedMessageHash 的簽章
        const signature = await signer.signMessage(ethers.getBytes(userOpHash));
        userOp.signature = signature;

        // 發送 UserOperation 給本地 Bundler
        console.log(`📤 傳送 UserOp #${i} (${action}) maxFeePerGas=${fee}`);
        await axios.post("http://localhost:3000/", {
            jsonrpc: "2.0",
            id: i + 1,
            method: "eth_sendUserOperation",
            params: [userOp, ENTRY_POINT_ADDRESS]
        });
    }

    console.log("✅ 所有 UserOperation 已送出");
}

main().catch(console.error);
