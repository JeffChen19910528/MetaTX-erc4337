const ethers = require('ethers');
const fs = require('fs');

async function main() {
    const RPC_URL = "http://localhost:8545";
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const signer = await provider.getSigner(0); // ✅ 使用部署時的 signer

    const deployInfo = JSON.parse(fs.readFileSync('deploy.json'));
    const walletAddress = deployInfo.wallet;

    console.log("💰 要轉帳到 SimpleWallet 地址:", walletAddress);

    const tx = await signer.sendTransaction({
        to: walletAddress,
        value: ethers.parseEther("1.0")
    });

    console.log("✅ 已轉帳；txHash:", tx.hash);
}

main().catch(console.error);
