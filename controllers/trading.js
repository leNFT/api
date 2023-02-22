import { utils } from "ethers";
import fetch from "node-fetch";
import { BigNumber } from "ethers";
import contractAddresses from "../contractAddresses.json" assert { type: "json" };
import tradingPoolContract from "../contracts/TradingPool.json" assert { type: "json" };
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
const tradingPoolInterface = new utils.Interface(tradingPoolContract.abi);
var tradingPools = {};
var collections = [];

// Fill the tradingPools array with the addresses of all the trading pools
const createTradingPoolResponse = await alchemy.core.getLogs({
  address: addresses.TradingPoolFactory,
  fromBlock: "earliest",
  toBlock: "latest",
  topics: [utils.id("CreateTradingPool(address,address,address)")],
});

for (let i = 0; i < createTradingPoolResponse.length; i++) {
  const result = createTradingPoolResponse[i];

  // Decode the event
  const nftAddress = utils.defaultAbiCoder.decode(
    ["address"],
    result.topics[2]
  )[0];
  const tokenAddress = utils.defaultAbiCoder.decode(
    ["address"],
    result.topics[3]
  )[0];
  const poolAddress = utils.defaultAbiCoder.decode(
    ["address"],
    result.topics[1]
  )[0];

  addTradingPool(poolAddress, nftAddress, tokenAddress, 5);
}

console.log("Finished adding initial trading pools");

// Create a websocket to listen for new pools
const newTradingPoolsFilter = {
  address: addresses.TradingPoolFactory,
  topics: [utils.id("CreateTradingPool(address,address,address)")],
};

alchemy.ws.on(newTradingPoolsFilter, (log, event) => {
  // Emitted whenever a new trading pool is created
  // Decode the event
  const nftAddress = utils.defaultAbiCoder.decode(
    ["address"],
    log.topics[2]
  )[0];
  const tokenAddress = utils.defaultAbiCoder.decode(
    ["address"],
    log.topics[3]
  )[0];
  const poolAddress = utils.defaultAbiCoder.decode(
    ["address"],
    log.topics[1]
  )[0];

  addTradingPool(poolAddress, nftAddress, tokenAddress, 5);

  console.log("Got new trading pool: ", poolAddress);
});

console.log("Set up new trading pools filter");

function poolLiquidityActivitySubscription(pool) {
  console.log("Creating liquidity activity subscription for ", pool);

  // Create a websocket to listen to a pools activity
  const addLiquidityPoolActivityFilter = {
    address: pool,
    topics: [
      utils.id(
        "AddLiquidity(address,uint256,uint256[],uint256,uint256,address,uint256,uint256)"
      ),
    ],
  };
  const removeLiquidityPoolActivityFilter = {
    address: pool,
    topics: [utils.id("RemoveLiquidity(address,uint256)")],
  };

  alchemy.ws.on(addLiquidityPoolActivityFilter, async (log, event) => {
    const getLpFunctionSig = "0xcdd3f298";
    const lpId = utils.defaultAbiCoder
      .decode(["uint256"], log.topics[2])[0]
      .toNumber();

    console.log("Got new add liquidity, lpId:", lpId);
    console.log("pool:", pool);
    const getNewLpResponse = await alchemy.core.call({
      to: pool,
      data:
        getLpFunctionSig +
        utils.defaultAbiCoder.encode(["uint256"], [lpId]).slice(2),
    });

    const lp = tradingPoolInterface.decodeFunctionResult(
      "getLP",
      getNewLpResponse
    );
    console.log("lp", lp);

    // Update pool info
    tradingPools[pool].nft.amount += lp[0].nftIds.length;
    tradingPools[pool].token.amount = BigNumber.from(lp[0].tokenAmount)
      .add(tradingPools[pool].token.amount)
      .toString();

    console.log("addedliquidity");
  });

  alchemy.ws.on(removeLiquidityPoolActivityFilter, async (log, event) => {
    const lpId = utils.defaultAbiCoder
      .decode(["uint256"], log.topics[2])[0]
      .toNumber();

    // If a user is doing a removing LP operation
    console.log("Got new remove liquidity");
    console.log("pool:", pool);
    const getNewLpResponse = await alchemy.core.call({
      to: pool,
      data:
        getLpFunctionSig +
        utils.defaultAbiCoder.encode(["uint256"], [lpId]).slice(2),
    });

    const lp = tradingPoolInterface.decodeFunctionResult(
      "getLP",
      getNewLpResponse
    );
    console.log("lp", lp);

    tradingPools[pool].nft.amount -= lp[0].nftIds.length;
    tradingPools[pool].token.amount = BigNumber.from(lp[0].tokenAmount)
      .sub(tradingPools[pool].token.amount)
      .toString();
  });
}

function poolTradingActivitySubscription(pool) {
  console.log("Creating trading activity subscription for ", pool);

  // Update LP from logs
  async function updateLPWithLog(log, mode) {
    console.log("log", log);
    // Emitted whenever a new buy / sell is done in a pool
    const decodedLog = tradingPoolInterface.parseLog({
      data: log.data,
      topics: log.topics,
    });
    console.log("decodedLog", decodedLog);
    const nfts = decodedLog.args.nftIds;
    const price = decodedLog.args.price;

    if (mode == "buy") {
      tradingPools[pool].nft.amount -= nfts.length;
      tradingPools[pool].token.amount = BigNumber.from(
        tradingPools[pool].token.amount
      )
        .add(price)
        .toString();
    } else if (mode == "sell") {
      tradingPools[pool].nft.amount += nfts.length;
      tradingPools[pool].token.amount = BigNumber.from(
        tradingPools[pool].token.amount
      )
        .sub(price)
        .toString();
    }

    // add the log to the pool's trade logs
    tradingPools[pool].tradeLogs.unshift(log);

    // Get the data for the last 24 hours to calculate the volume
    const currentBlock = await alchemy.core.getBlockNumber();
    var volume = "0";
    for (let i = 0; i < tradingPools[pool].tradeLogs.length; i++) {
      if (tradingPools[pool].tradeLogs[i].blockNumber < currentBlock - 5760) {
        // Remove the logs that are older than 24 hours and past the 100th log
        if (i > 100) {
          tradingPools[pool].tradeLogs.splice(i);
        }
        break;
      }
      const tradeLogData = tradingPoolInterface.parseLog(
        tradingPools[pool].tradeLogs[i]
      );
      volume = BigNumber.from(volume).add(tradeLogData.args.price).toString();
    }

    // Update the volume
    tradingPools[pool].volume = volume;
  }

  // Create two websocket to listen to a pools activity (buy and sell)
  const buyPoolActivityFilter = {
    address: pool,
    topics: [utils.id("Buy(address,uint256[],uint256)")],
  };

  const sellPoolActivityFilter = {
    address: pool,
    topics: [utils.id("Sell(address,uint256[],uint256)")],
  };

  alchemy.ws.on(sellPoolActivityFilter, async (log, event) => {
    console.log("Got new selling swap");
    await updateLPWithLog(log, "sell");
  });

  alchemy.ws.on(buyPoolActivityFilter, async (log, event) => {
    console.log("Got new buying swap");
    await updateLPWithLog(log, "buy");
  });
}

async function addTradingPool(poolAddress, nftAddress, tokenAddress, chainId) {
  const getNameFunctionSig = "0x06fdde03";
  const getSymbolFunctionSig = "0x95d89b41";
  const getGaugeFunctionSig = "0xb1c6f0e9";
  const balanceOfFunctionSig = "0x70a08231";

  var chainName;
  if (chainId == 1) {
    chainName = "mainnet";
  } else if (chainId == 5) {
    chainName = "goerli";
  } else {
    return "Unsupported ChainID";
  }

  const addresses =
    chainId in contractAddresses
      ? contractAddresses[chainId]
      : contractAddresses["1"];

  try {
    const buyLogs = await alchemy.core.getLogs({
      address: poolAddress,
      fromBlock: "earliest",
      toBlock: "latest",
      topics: [utils.id("Buy(address,uint256[],uint256)")],
    });

    const sellLogs = await alchemy.core.getLogs({
      address: poolAddress,
      fromBlock: "earliest",
      toBlock: "latest",
      topics: [utils.id("Sell(address,uint256[],uint256)")],
    });

    const tradeLogs = buyLogs.concat(sellLogs);
    tradeLogs.sort((a, b) => b.blockNumber - a.blockNumber);
    console.log("tradeLogs", tradeLogs);
    // Get the data for the last 24 hours to calculate the volume
    var volume = "0";
    const currentBlock = await alchemy.core.getBlockNumber();
    for (let i = 0; i < tradeLogs.length; i++) {
      if (tradeLogs[i].blockNumber < currentBlock - 5760) {
        // Remove the logs that are older than 24 hours and past the 100th log
        if (i > 100) {
          tradeLogs.splice(i);
        }
        break;
      }
      const tradeLogData = tradingPoolInterface.parseLog(tradeLogs[i]);
      volume = BigNumber.from(volume).add(tradeLogData.args.price).toString();
    }

    const tokenSymbolResponse = await alchemy.core.call({
      to: tokenAddress,
      data: getSymbolFunctionSig,
    });

    const nftNameResponse = await alchemy.core.call({
      to: nftAddress,
      data: getNameFunctionSig,
    });

    const gaugeResponse = await alchemy.core.call({
      to: addresses.GaugeController,
      data:
        getGaugeFunctionSig +
        utils.defaultAbiCoder.encode(["address"], [poolAddress]).substring(2),
    });

    const nftAmountResponse = await alchemy.core.call({
      to: nftAddress,
      data:
        balanceOfFunctionSig +
        utils.defaultAbiCoder.encode(["address"], [poolAddress]).substring(2),
    });

    const tokenAmountResponse = await alchemy.core.call({
      to: tokenAddress,
      data:
        balanceOfFunctionSig +
        utils.defaultAbiCoder.encode(["address"], [poolAddress]).substring(2),
    });

    const nftName = utils.defaultAbiCoder.decode(
      ["string"],
      nftNameResponse
    )[0];
    const tokenSymbol = utils.defaultAbiCoder.decode(
      ["string"],
      tokenSymbolResponse
    )[0];
    const gauge = utils.defaultAbiCoder.decode(["address"], gaugeResponse)[0];

    const nftAmount = utils.defaultAbiCoder
      .decode(["uint256"], nftAmountResponse)[0]
      .toString();

    const tokenAmount = utils.defaultAbiCoder
      .decode(["uint256"], tokenAmountResponse)[0]
      .toString();

    console.log("GEtting image");

    // Get the image for the collection
    const nftMetadata = await alchemy.nft.getNftMetadata(nftAddress, "1");
    var nftImage;

    if (nftMetadata.media[0]) {
      nftImage = nftMetadata.media[0].gateway;
    } else if (nftMetadata.tokenUri.gateway) {
      nftImage = nftMetadata.tokenUri.gateway;
    } else {
      nftImage = "";
    }

    tradingPools[poolAddress] = {
      tradeLogs: tradeLogs,
      gauge: gauge,
      volume: volume,
      nft: {
        amount: nftAmount,
        name: nftName,
        address: nftAddress,
        image: nftImage,
      },
      token: {
        amount: tokenAmount,
        name: tokenSymbol,
        address: tokenAddress,
      },
    };

    // Add the collection to the list of collections
    collections.push({
      address: nftAddress,
      name: nftName,
      image: nftImage,
      pool: poolAddress,
    });

    // Subscribe to the new trading pool activites
    poolTradingActivitySubscription(poolAddress);
    poolLiquidityActivitySubscription(poolAddress);

    console.log("Finished setting up pools");
  } catch (error) {
    console.log(error);
  }
}

// Controller function that returns the trading pools
export async function getPools(req, res) {
  res.status(200).json(tradingPools);
}

// Controller function that returns the trading pool history
export async function getPoolHistory(req, res) {
  const { chainId, pool } = req.query;
  console.log("chainId", chainId);
  console.log("pool", pool);

  var history = [];
  const tradeLogs = tradingPools[pool].tradeLogs;

  // Send the last 25 trades
  for (let i = 0; i < 25; i++) {
    if (i == tradeLogs.length) {
      break;
    }

    const decodedLog = tradingPoolInterface.parseLog({
      data: tradeLogs[i].data,
      topics: tradeLogs[i].topics,
    });
    const blockResponse = await alchemy.core.getBlock(tradeLogs[i].blockNumber);

    history.push({
      type: decodedLog.name.toLowerCase(),
      timestamp: blockResponse.timestamp,
      address: tradeLogs[i].address,
      nftIds: decodedLog.args.nftIds.map((id) => BigNumber.from(id).toNumber()),
      price: BigNumber.from(decodedLog.args.price).toString(),
      transaction: tradeLogs[i].transactionHash,
    });
  }

  res.status(200).json(history);
}

export async function getCollections(req, res) {
  res.status(200).json(collections);
}
