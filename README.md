# ERC-4337 Meta-Transaction 專案操作流程

## 安裝與部署步驟

1. 安裝依賴
   ```bash
   npm install
   ```

2. 啟動本地節點（開啟 Hardhat Network）
   ```bash
   npx hardhat node
   ```

3. 編譯合約
   ```bash
   npx hardhat compile
   ```

4. 部署合約至本地網路
   ```bash
   npx hardhat run scripts/deploy.js --network localhost
   ```

5. 啟動 Bundler
   ```bash
   node bundler.js
   ```

6. 為錢包地址添加資金
   ```bash
   node fundWallet.js
   ```

7. 傳送 UserOperation（模擬交易）
   ```bash
   node sendUserOp.js
   ```

8. 檢查 Counter 狀態
   ```bash
   node checkCounter.js
   ```

---

## 驗證 SimpleWallet 的擁有者

1. 進入 Hardhat Console：
   ```bash
   npx hardhat console --network localhost
   ```

2. 查詢 SimpleWallet 擁有者地址：
   ```js
   const wallet = await ethers.getContractAt("SimpleWallet", "0x你部署的SimpleWallet地址");
   await wallet.owner();
   ```

---

> 💡 請確認你部署的 `SimpleWallet` 地址是否正確，並與 `deploy.json` 中記錄的一致。
