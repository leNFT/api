import fetch from "node-fetch";
import { BigNumber } from "ethers";
import { utils } from "ethers";
import contractAddresses from "../contractAddresses.json" assert { type: "json" };
import { Network } from "alchemy-sdk";
import { Alchemy } from "alchemy-sdk";
import { config } from "dotenv";
config();

const addresses = contractAddresses[5];
const alchemySettings = {
  apiKey: process.env.ALCHEMY_API_KEY,
  network: Network.ETH_GOERLI,
};
const alchemy = new Alchemy(alchemySettings);
const epochFunctionSig = utils.id("epoch(uint256)").substring(0, 10);
const totalFeesAtFunctionSig = utils
  .id("totalFeesAt(address,uint256)")
  .substring(0, 10);
const balanceOfFunctionSig = utils.id("balanceOf(address)").substring(0, 10);
const totalSupplyFunctionSig = utils.id("totalSupply()").substring(0, 10);

var history = [];

// Get the last 5 epochs of lock history
console.log("Getting current epoch", Math.floor(Date.now() / 1000));
const epochResponse = await alchemy.core.call({
  to: addresses.VotingEscrow,
  data:
    epochFunctionSig +
    utils.defaultAbiCoder
      .encode(["uint256"], [Math.floor(Date.now() / 1000)])
      .substring(2),
});
const currentEpoch = BigNumber.from(epochResponse).toNumber();
console.log("Current epoch", currentEpoch);

var startEpoch;
if (currentEpoch > 5) {
  startEpoch = currentEpoch - 5;
} else {
  startEpoch = 0;
}

for (let i = startEpoch; i <= currentEpoch; i++) {
  await addEpoch(i);
}

async function addEpoch(epoch) {
  const feesResponse = await alchemy.core.call({
    to: addresses.FeeDistributor,
    data:
      totalFeesAtFunctionSig +
      utils.defaultAbiCoder
        .encode(["address"], [addresses.ETH.address])
        .slice(2) +
      utils.defaultAbiCoder.encode(["uint256"], [epoch]).slice(2),
  });

  // Get locked and total supply for epoch
  const lockedResponse = await alchemy.core.call({
    to: addresses.NativeToken,
    data:
      balanceOfFunctionSig +
      utils.defaultAbiCoder
        .encode(["address"], [addresses.VotingEscrow])
        .slice(2),
  });

  console.log("lockedResponse", BigNumber.from(lockedResponse).toString());

  const totalSupplyResponse = await alchemy.core.call({
    to: addresses.NativeToken,
    data: totalSupplyFunctionSig,
  });

  console.log(
    "totalSupplyResponse",
    BigNumber.from(totalSupplyResponse).toString()
  );

  history.push({
    epoch: epoch,
    rewards: BigNumber.from(feesResponse).toString(),
    supply_locked: BigNumber.from(totalSupplyResponse).eq(0)
      ? 0
      : BigNumber.from(lockedResponse)
          .mul(10000)
          .div(totalSupplyResponse)
          .toNumber(),
  });
}

// Controller function for the GET route
export async function getHistory(req, res) {
  const { chainId } = req.query;

  // GEt the current epoch
  console.log("Getting current epoch", Math.floor(Date.now() / 1000));
  const epochResponse = await alchemy.core.call({
    to: addresses.VotingEscrow,
    data:
      epochFunctionSig +
      utils.defaultAbiCoder
        .encode(["uint256"], [Math.floor(Date.now() / 1000)])
        .substring(2),
  });
  const currentEpoch = BigNumber.from(epochResponse).toNumber();
  console.log("Current epoch", currentEpoch);

  if (currentEpoch > history[history.length - 1].epoch) {
    for (
      let i = history[history.length - 1].epoch + 1;
      i <= currentEpoch;
      i++
    ) {
      await addEpoch(i);
    }
  }

  res.status(200).json(history.slice(-5).reverse());
}
