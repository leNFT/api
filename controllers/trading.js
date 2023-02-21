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

var tradingPools = {};

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
    const tradingPoolInterface = new utils.Interface(tradingPoolContract.abi);

    // Get the data for the last 24 hours to calculate the volume
    var volume = "0";
    const currentBlock = await alchemy.core.getBlockNumber();
    while (
      tradeLogs.length > 0 &&
      tradeLogs[tradeLogs.length - 1].blockNumber > currentBlock - 5760
    ) {
      const tradeLog = tradeLogs.pop();
      const tradeLogData = tradingPoolInterface.parseLog(tradeLog);
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

    // Get the image for the collection
    const url =
      "https://eth-" +
      chainName +
      ".g.alchemy.com/nft/v2/" +
      process.env.ALCHEMY_API_KEY +
      "/getNFTMetadata";

    const options = {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    };
    const getNFTMetadataResponse = await fetch(
      url + "?contractAddress=" + nftAddress + "&tokenId=" + 1,
      options
    ).catch((err) => console.error(err));
    const nftMetadata = await getNFTMetadataResponse.json();
    var nftImage;

    if (nftMetadata.media[0].gateway) {
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
  } catch (error) {
    console.log(error);
  }
}

// Controller function for the GET route
export async function getPools(req, res) {
  res.status(200).json(tradingPools);
}
