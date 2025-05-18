npm install
1. npx hardhat node
2. npx hardhat compile
3. npx hardhat run scripts/deploy.js --network localhost
4. node bundler.js
5. node fundWallet.js
6. node sendUserOp.js
7. node checkCounter.js

check your key:
npx hardhat console --network localhost
const wallet = await ethers.getContractAt("SimpleWallet", "0x你部署的SimpleWallet地址")
await wallet.owner()