import { utils } from "ethers";
import { BigNumber } from "ethers";
import contractAddresses from "../contractAddresses.json" assert { type: "json" };
import { Network } from "alchemy-sdk";
import { Alchemy } from "alchemy-sdk";
import { config } from "dotenv";
config();

const addresses = contractAddresses[5];
const alchemySettings = {
  apiKey: process.env.ALCHEMY_API_KEY_GOERLI,
  network: Network.ETH_GOERLI,
};
const alchemy = new Alchemy(alchemySettings);
var lendingPools = {};
var collections = {};

const createLendingPoolResponse = await alchemy.core.getLogs({
  address: addresses.LendingMarket,
  fromBlock: "earliest",
  toBlock: "latest",
  topics: [utils.id("CreateLendingPool(address)")],
});

for (let i = 0; i < createLendingPoolResponse.length; i++) {
  const poolAddress = utils.defaultAbiCoder.decode(
    ["address"],
    createLendingPoolResponse[i].topics[1]
  )[0];

  await addLendingPool(poolAddress);

  await createLendingPoolActivityListener(poolAddress);
}

const setLendingPoolResponse = await alchemy.core.getLogs({
  address: addresses.LendingMarket,
  fromBlock: "earliest",
  toBlock: "latest",
  topics: [utils.id("SetLendingPool(address,address,address)")],
});

for (let i = 0; i < setLendingPoolResponse.length; i++) {
  const result = setLendingPoolResponse[i];

  await setLendingPool(
    utils.defaultAbiCoder.decode(["address"], result.topics[1])[0],
    utils.defaultAbiCoder.decode(["address"], result.topics[3])[0]
  );
}

console.log("lendingPools: ", lendingPools);
console.log("collections: ", collections);

// Create a websocket to listen for new pools
const newLendingPoolsFilter = {
  address: addresses.LendingMarket,
  topics: [utils.id("CreateLendingPool(address)")],
};

alchemy.ws.on(newLendingPoolsFilter, (log, event) => {
  // Emitted whenever a new trading pool is created
  const poolAddress = utils.defaultAbiCoder.decode(
    ["address"],
    log.topics[1]
  )[0];
  addLendingPool(poolAddress);
  createLendingPoolActivityListener(poolAddress);

  console.log("Got new lending pool: ", poolAddress);
});

console.log("Set up new lending pools filter");

// Create a websocket to listen for new set pool
const setLendingPoolsFilter = {
  address: addresses.LendingMarket,
  topics: [utils.id("SetLendingPool(address,address,address)")],
};

alchemy.ws.on(setLendingPoolsFilter, (log, event) => {
  const poolAddress = utils.defaultAbiCoder.decode(
    ["address"],
    log.topics[3]
  )[0];
  const nftAddress = utils.defaultAbiCoder.decode(
    ["address"],
    log.topics[1]
  )[0];

  // Emitted whenever a new trading pool is created
  setLendingPool(nftAddress, poolAddress);

  console.log("Set lending pool: ", poolAddress, " for ", nftAddress);
});

console.log("Set up new lending pools filter");

async function createLendingPoolActivityListener(poolAddress) {
  // Create a websocket to listen for new pool borrow rate updates
  const setLendingUpdateBorrowRateFilter = {
    address: addresses.LendingMarket,
    topics: [utils.id("UpdatedBorrowRate(address,address,address)")],
  };
  alchemy.ws.on(setLendingUpdateBorrowRateFilter, (log, event) => {
    const poolAddress = utils.defaultAbiCoder.decode(
      ["address"],
      log.topics[0]
    )[0];
    // Emitted whenever a new trading pool is created
    updatePoolDetails(poolAddress);
  });
}

// Add a new lending pool to the list
async function addLendingPool(poolAddress) {
  const getGaugeFunctionSig = "0xb1c6f0e9";

  const gaugeResponse = await alchemy.core.call({
    to: addresses.GaugeController,
    data:
      getGaugeFunctionSig +
      utils.defaultAbiCoder.encode(["address"], [poolAddress]).substring(2),
  });

  lendingPools[poolAddress] = {
    assets: [],
    gauge: utils.defaultAbiCoder.decode(["address"], gaugeResponse)[0],
    borrowRate: 0,
    supplyRate: 0,
    tvl: "0",
  };

  await updatePoolDetails(poolAddress);
}

async function updatePoolDetails(poolAddress) {
  // Add lending pool details
  const totalAssetsFunctionSig = "0x01e1d114";
  const getSupplyRateFunctionSig = "0x84bdc9a8";
  const getBorrowRateFunctionSig = "0xba1c5e80";

  const tvlResponse = await alchemy.core.call({
    to: poolAddress,
    data: totalAssetsFunctionSig,
  });

  const supplyRateResponse = await alchemy.core.call({
    to: poolAddress,
    data: getSupplyRateFunctionSig,
  });

  const borrowRateResponse = await alchemy.core.call({
    to: poolAddress,
    data: getBorrowRateFunctionSig,
  });

  lendingPools[poolAddress].borrowRate =
    BigNumber.from(borrowRateResponse).toNumber();
  lendingPools[poolAddress].supplyRate =
    BigNumber.from(supplyRateResponse).toNumber();
  lendingPools[poolAddress].tvl = BigNumber.from(tvlResponse).toString();
}

// Set the lending pool for a collection
async function setLendingPool(nftAddress, poolAddress) {
  const getNameFunctionSig = "0x06fdde03";
  const nftNameResponse = await alchemy.core.call({
    to: nftAddress,
    data: getNameFunctionSig,
  });

  collections[nftAddress] = {
    pool: poolAddress,
  };

  console.log("Set lending pool: ", poolAddress, " for ", nftAddress);
  console.log("lendingPools: ", lendingPools[poolAddress]);

  lendingPools[poolAddress].assets.push({
    address: nftAddress,
    name: utils.defaultAbiCoder.decode(["string"], nftNameResponse)[0],
  });
}

// Controller function that returns the trading pools
export async function getPools(req, res) {
  res.status(200).json(lendingPools);
}

export async function getCollections(req, res) {
  const { pool } = req.query;

  if (pool) {
    res.status(200).json(lendingPools[pool].assets);
  }

  res.status(200).json(collections);
}
