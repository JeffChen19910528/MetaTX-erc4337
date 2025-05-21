const express = require('express');
const ethers = require('ethers');
const bodyParser = require('body-parser');
const fs = require('fs');

// === 讀取部署資訊 ===
const deployInfo = JSON.parse(fs.readFileSync('deploy.json'));
const ENTRY_POINT_ADDRESS = deployInfo.entryPoint;
const COUNTER_ADDRESS = deployInfo.counter;

const RPC_URL = "http://localhost:8545";
const PRIVATE_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const PORT = 3000;
const LOG_FILE = "./revert-errors.log";

// === ABI 定義 ===
const counterABI = [
    "function increase()",
    "function decrease()",
    "event NumberChanged(string action, uint256 newValue)"
];
const walletABI = ["function execute(address target, bytes data)"];
const entryPointABI = [
    `function handleOps(
        tuple(
            address sender,
            uint256 nonce,
            bytes initCode,
            bytes callData,
            uint256 callGasLimit,
            uint256 verificationGasLimit,
            uint256 preVerificationGas,
            uint256 maxFeePerGas,
            uint256 maxPriorityFeePerGas,
            bytes paymasterAndData,
            bytes signature,
            uint256 meta_tx_id,
            uint256 meta_tx_order_id,
            uint8 userOpsCount
        )[] ops,
        address beneficiary
    )`,
    "event UserOpHandled(address indexed sender, bool success, string reason)",
    "event MetaTransactionHandled(uint256 indexed meta_tx_id, bool success)"
];

const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

const counterInterface = new ethers.Interface(counterABI);
const walletInterface = new ethers.Interface(walletABI);
const entryPointInterface = new ethers.Interface(entryPointABI);

const app = express();
app.use(bodyParser.json());

let pendingUserOps = [];
let isHandling = false;

console.log("\uD83D\uDEE0\uFE0F Bundler 啟動中，使用 EntryPoint 地址:", ENTRY_POINT_ADDRESS);

app.post('/', async (req, res) => {
    const { method, params } = req.body;
    if (method !== 'eth_sendUserOperation') {
        return res.status(400).send({ error: 'Only eth_sendUserOperation is supported' });
    }

    const [userOp, entryPointAddr] = params;
    if (entryPointAddr.toLowerCase() !== ENTRY_POINT_ADDRESS.toLowerCase()) {
        console.error(`❌ EntryPoint mismatch！收到: ${entryPointAddr} 期待: ${ENTRY_POINT_ADDRESS}`);
        return res.status(400).send({ error: 'EntryPoint address mismatch' });
    }

    console.log("✅ 收到 UserOperation");
    pendingUserOps.push(userOp);
    res.send({ result: "UserOperation queued" });
});

// === 每 3 秒處理一次批次
setInterval(async () => {
    if (pendingUserOps.length === 0 || isHandling) return;
    isHandling = true;

    try {
        pendingUserOps.sort((a, b) => {
            const aFee = BigInt(a.maxFeePerGas);
            const bFee = BigInt(b.maxFeePerGas);
            return aFee > bFee ? -1 : aFee < bFee ? 1 : 0;
        });

        console.log("🧾 正在處理 UserOperations（按 maxFeePerGas 排序）:");
        pendingUserOps.forEach((op, idx) => {
            try {
                const decoded = walletInterface.decodeFunctionData("execute", op.callData);
                const target = decoded.target;
                const innerData = decoded.data;
                let label = "unknown";
                if (target.toLowerCase() === COUNTER_ADDRESS.toLowerCase()) {
                    const parsed = counterInterface.parseTransaction({ data: innerData });
                    label = parsed.name;
                }
                console.log(`  #${idx} - nonce: ${parseInt(op.nonce)}, 呼叫: ${label}, maxFeePerGas: ${BigInt(op.maxFeePerGas)} wei`);
            } catch {
                console.log(`  #${idx} - nonce: ${parseInt(op.nonce)}, callData 無法解譯`);
            }
            console.log(`     meta_tx_id: ${op.meta_tx_id}, meta_tx_order_id: ${op.meta_tx_order_id}, userOpsCount: ${op.userOpsCount}`);
            console.log(`     callDataHash: ${ethers.keccak256(op.callData)}`);
        });

        const userOpsArray = pendingUserOps.map(op => [
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
            op.signature,
            op.meta_tx_id,
            op.meta_tx_order_id,
            op.userOpsCount
        ]);

        const calldata = entryPointInterface.encodeFunctionData("handleOps", [userOpsArray, wallet.address]);

        const tx = await wallet.sendTransaction({
            to: ENTRY_POINT_ADDRESS,
            data: calldata,
            gasLimit: 3_000_000n
        });

        console.log(`📤 批次送出 ${pendingUserOps.length} 筆 UserOperation! txHash: ${tx.hash}`);
        const receipt = await tx.wait();

        console.log(`⛽ 實際總 Gas Used: ${receipt.gasUsed.toString()} wei`);

        for (const log of receipt.logs) {
            try {
                const parsed = counterInterface.parseLog(log);
                console.log(`📊 [Counter 事件] ${parsed.args.action}: ${parsed.args.newValue.toString()}`);
            } catch {}

            try {
                const parsed = entryPointInterface.parseLog(log);

                if (parsed.name === "UserOpHandled") {
                    const op = pendingUserOps.shift();
                    const { sender, success, reason } = parsed.args;
                    console.log(`📣 [UserOpHandled] sender=${sender}`);
                    console.log(`     meta_tx_id: ${op.meta_tx_id}, meta_tx_order_id: ${op.meta_tx_order_id}, userOpsCount: ${op.userOpsCount}`);
                    console.log(`     success=${success}, reason=${reason}`);
                } else if (parsed.name === "MetaTransactionHandled") {
                    const { meta_tx_id, success } = parsed.args;
                    console.log(`✅ [MetaTransactionHandled] meta_tx_id=${meta_tx_id}, success=${success}`);
                }
            } catch {}
        }

    } catch (err) {
        const payload = err?.error?.data || err?.data?.data || err?.data;

        const errorMessage = `❌ 批次送出失敗: ${err.message || err.reason || err}`;
        fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${errorMessage}
`, 'utf8');

        if (payload && typeof payload === 'string' && payload.startsWith("0x08c379a0")) {
            const reasonHex = "0x" + payload.slice(138);
            try {
                const reasonStr = ethers.toUtf8String(reasonHex);
                console.error("🔍 Revert 原因:", reasonStr);

                const logLine = `[${new Date().toISOString()}] Revert: ${reasonStr}\n`;
                fs.appendFileSync(LOG_FILE, logLine, 'utf8');
            } catch (e) {
                const fallback = `[${new Date().toISOString()}] ⚠️ 解碼 revert reason 失敗，原始 payload: ${payload}\n`;
                fs.appendFileSync(LOG_FILE, fallback, 'utf8');
                console.error("⚠️ 解碼 revert reason 失敗，格式可能非標準 Error(string)");
            }
        } else if (typeof payload === 'object') {
            console.error("⚠️ 低階 VM 錯誤物件:", JSON.stringify(payload, null, 2));
        }
    } finally {
        console.log(`🧹 清空 pendingUserOps (${pendingUserOps.length} 筆)`);
        pendingUserOps = [];
        isHandling = false;
    }
}, 3000);

app.listen(PORT, () => {
    console.log(`🚀 Bundler server listening at http://localhost:${PORT}`);
});