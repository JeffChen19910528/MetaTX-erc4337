const ethers = require('ethers');
const fs = require('fs');

async function main() {
    const RPC_URL = "http://localhost:8545";
    const provider = new ethers.JsonRpcProvider(RPC_URL);

    const deployInfo = JSON.parse(fs.readFileSync('deploy.json'));
    const COUNTER_ADDRESS = deployInfo.counter;
    const ENTRY_POINT_ADDRESS = deployInfo.entryPoint;

    const counterABI = [
        "function number() view returns (uint256)"
    ];
    const entryPointABI = [
        "event UserOpHandled(address indexed sender, bool success, string reason)"
    ];

    const counter = new ethers.Contract(COUNTER_ADDRESS, counterABI, provider);
    const entryPoint = new ethers.Contract(ENTRY_POINT_ADDRESS, entryPointABI, provider);

    const value = await counter.number();
    console.log("📈 Counter 現在的數值是:", value.toString());

    console.log("🔍 解析 EntryPoint 中最近的 UserOpHandled 事件...");

    const latest = await provider.getBlockNumber();
    const startBlock = Math.max(0, latest - 1000); // ✅ 避免負數區塊

    const logs = await entryPoint.queryFilter("UserOpHandled", startBlock, latest);

    if (logs.length === 0) {
        console.log("⚠️ 沒有找到 UserOpHandled 事件");
    } else {
        for (const log of logs) {
            const { sender, success, reason } = log.args;
            console.log(`📣 sender=${sender}, 成功=${success}, 原因=${reason}`);
        }
    }
}

main().catch(console.error);
