const hre = require("hardhat");
const fs = require("fs");

async function main() {
    const [deployer] = await hre.ethers.getSigners();
    console.log("🚀 使用部署帳號:", deployer.address);

    const contracts = {};

    // 1. 部署 EntryPoint
    const EntryPoint = await hre.ethers.getContractFactory("EntryPoint");
    const entryPoint = await EntryPoint.deploy();
    await entryPoint.waitForDeployment();
    contracts.entryPoint = await entryPoint.getAddress();
    console.log("✅ EntryPoint 部署完成:", contracts.entryPoint);

    // 2. 部署 Counter
    const Counter = await hre.ethers.getContractFactory("Counter");
    const counter = await Counter.deploy();
    await counter.waitForDeployment();
    contracts.counter = await counter.getAddress();
    console.log("✅ Counter 部署完成:", contracts.counter);

    // 3. 部署 SimpleWallet
    const SimpleWallet = await hre.ethers.getContractFactory("SimpleWallet");
    const wallet = await SimpleWallet.deploy(deployer.address, contracts.entryPoint);
    await wallet.waitForDeployment();
    contracts.wallet = await wallet.getAddress();
    console.log("✅ SimpleWallet 部署完成:", contracts.wallet);

    // 寫入 deploy.json
    fs.writeFileSync("deploy.json", JSON.stringify(contracts, null, 2));
    console.log("\n📦 所有合約已部署，資訊已寫入 deploy.json");
}

main().catch((error) => {
    console.error("❌ 部署發生錯誤:", error);
    process.exit(1);
});
