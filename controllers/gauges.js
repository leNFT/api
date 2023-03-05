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
var gauges = {};

const addGaugeResponse = await alchemy.core.getLogs({
  address: addresses.GaugeController,
  fromBlock: "earliest",
  toBlock: "latest",
  topics: [utils.id("AddGauge(address,address)")],
});

console.log("Found ", addGaugeResponse.length, " gauges");

for (let i = 0; i < addGaugeResponse.length; i++) {
  const result = addGaugeResponse[i];

  await addGauge(
    utils.defaultAbiCoder.decode(["address"], result.topics[1])[0],
    utils.defaultAbiCoder.decode(["address"], result.topics[2])[0]
  );
}

console.log("gauges: ", gauges);

// Create a websocket to listen for new pools
const addGaugeFilter = {
  address: addresses.GaugeController,
  topics: [utils.id("AddGauge(address,address)")],
};

alchemy.ws.on(addGaugeFilter, (log, event) => {
  // Emitted whenever a new gauge is added
  const gaugeAddress = utils.defaultAbiCoder.decode(
    ["address"],
    log.topics[1]
  )[0];
  const poolAddress = utils.defaultAbiCoder.decode(
    ["address"],
    log.topics[2]
  )[0];
  addGauge(gaugeAddress, poolAddress);

  console.log("Got new gauge: ", gaugeAddress);
});

console.log("Set up new gauge filter");

// Add a new lending pool to the list
async function addGauge(gaugeAddress, poolAddress) {
  // Get the name of the pool this token is the
  const poolName = await alchemy.core.call({
    to: poolAddress,
    data: utils.id("name()").substring(0, 10),
  });

  console.log("Adding gauge: ", gaugeAddress);
  gauges[gaugeAddress] = {
    pool: { address: poolAddress, name: poolName },
    history: [],
  };
}

// Controller function that returns the trading pools
export async function getGauges(req, res) {
  console.log("Getting gauges: ", gauges);
  res.status(200).json(gauges);
}

// Controller function that returns the history of a gauge
export async function getGaugeHistory(req, res) {
  const { gauge } = req.query;
  console.log("Getting gauge history for: ", gauge);

  const epochFunctionSig = utils.id("epoch(uint256)").substring(0, 10);
  const getGaugeRewardsFunctionSig = utils
    .id("getGaugeRewards(address,uint256)")
    .substring(0, 10);
  const getGaugeWeightAtFunctionSig = utils
    .id("getGaugeWeightAt(address,uint256)")
    .substring(0, 10);
  const getTotalWeightAtFunctionSig = utils
    .id("getTotalWeightAt(uint256)")
    .substring(0, 10);

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
  const epoch = BigNumber.from(epochResponse).toNumber();
  console.log("Current epoch", epoch);

  // Make sure the gauge object has the last 5 epochs of gauge data
  var lastSavedEpoch = 0;
  var startingEpoch = 0;
  if (gauges[gauge].history.length != 0) {
    lastSavedEpoch =
      gauges[gauge].history[gauges[gauge].history.length - 1].epoch;
  }

  if (epoch - lastSavedEpoch > 5) {
    startingEpoch = epoch - 5;
  } else if (lastSavedEpoch == 0) {
    startingEpoch = lastSavedEpoch;
  } else {
    startingEpoch = lastSavedEpoch + 1;
  }

  console.log("Starting epoch", startingEpoch);

  for (let i = startingEpoch; i < epoch; i++) {
    // Get the gauge rewards for this epoch
    const gaugeRewardsResponse = await alchemy.core.call({
      to: addresses.GaugeController,
      data:
        getGaugeRewardsFunctionSig +
        utils.defaultAbiCoder.encode(["address"], [gauge]).slice(2) +
        utils.defaultAbiCoder.encode(["uint256"], [i]).slice(2),
    });

    // Get gauge and total weight for epoch
    const gaugeWeigthResponse = await alchemy.core.call({
      to: addresses.GaugeController,
      data:
        getGaugeWeightAtFunctionSig +
        utils.defaultAbiCoder.encode(["address"], [gauge]).slice(2) +
        utils.defaultAbiCoder.encode(["uint256"], [i]).slice(2),
    });

    console.log(
      "Gauge weight",
      BigNumber.from(gaugeRewardsResponse).toString()
    );

    const totalWeightResponse = await alchemy.core.call({
      to: addresses.GaugeController,
      data:
        getTotalWeightAtFunctionSig +
        utils.defaultAbiCoder.encode(["uint256"], [i]).slice(2),
    });

    console.log("Total weight", BigNumber.from(totalWeightResponse).toString());

    gauges[gauge].history.push({
      epoch: i,
      rewards: BigNumber.from(gaugeRewardsResponse).toString(),
      stake: BigNumber.from(totalWeightResponse).eq(0)
        ? 0
        : BigNumber.from(gaugeWeigthResponse)
            .mul(10000)
            .div(totalWeightResponse)
            .toNumber(),
    });
  }

  res.status(200).json(gauges[gauge].history.slice(-5).reverse());
}
