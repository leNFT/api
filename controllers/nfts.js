import fetch from "node-fetch";
import contractAddresses from "../contractAddresses.json" assert { type: "json" };
import { utils } from "ethers";
import { BigNumber } from "ethers";
import { Network } from "alchemy-sdk";
import { Alchemy } from "alchemy-sdk";
import { getMessage } from "eip-712";
import { config } from "dotenv";
config();

// Controller function for the GET route
export async function getImageURL(req, res) {
  const { address, tokenId, chainId } = req.query;
  console.log("address: " + address);
  console.log("tokenId: " + tokenId);
  console.log("chainId: " + chainId);

  var chainName;
  if (chainId == 1) {
    chainName = "mainnet";
  } else if (chainId == 5) {
    chainName = "goerli";
  } else {
    return "Unsupported ChainID";
  }

  const alchemySettings = {
    apiKey: process.env.ALCHEMY_API_KEY_GOERLI,
    network: Network.ETH_GOERLI,
  };
  const alchemy = new Alchemy(alchemySettings);

  const nftMetadata = await alchemy.nft.getNftMetadata(address, tokenId);

  if (nftMetadata.media && nftMetadata.media[0]) {
    res.status(200).json(nftMetadata.media[0].gateway);
  } else if (nftMetadata.tokenUri) {
    res.status(200).json(nftMetadata.tokenUri.gateway);
  } else {
    res.status(200).json("");
  }
}

export async function getFloorPrice(req, res) {
  const { address, chainId } = req.query;
  var floorPrice = "0";

  console.log("Got a price request for chainID:", chainId);
  if (!(address && chainId)) {
    //Check inputs
    res.status(400).json({ error: "Lacks input data" });
  }

  // Test collections case for goerli
  if (chainId == "5") {
    floorPrice = "8000000000000000"; //Price of 0.008 ETH
    // Mainnet Case
  } else {
    const options = {
      method: "GET",
      headers: {
        Accept: "application/json",
        "x-api-key": process.env.UPSHOT_API_KEY,
      },
    };

    const url = "https://api.upshot.xyz/v2/collections/" + address;

    const collectionResponse = await fetch(url, options).catch((err) =>
      console.error(err)
    );
    const collection = await collectionResponse.json();

    //Build return data
    console.log(collection);
    if (collection.data) {
      floorPrice = collection.data.floor.wei;
    }
  }
  res.status(200).json(floorPrice);
}

export async function getPrice(req, res) {
  const { requestId, collection, tokenIds, chainId } = req.query;
  const tokensIdsArray = tokenIds.split(",");
  const expiryTimestamp = Math.round(Date.now() / 1000) + 3600;
  var priceSum = 0;

  console.log("Got a price request for chainID:", chainId);
  if (!(collection && chainId)) {
    //Check inputs
    res.status(400).json({ error: "Lacks input data" });
  }

  const addresses =
    chainId in contractAddresses
      ? contractAddresses[chainId]
      : contractAddresses["1"];

  // Test collections case for goerli
  if (chainId == "5") {
    priceSum = BigNumber.from("8000000000000000")
      .mul(tokensIdsArray.length)
      .toString(); //Price of 0.008 ETH per Token

    // Mainnet Case
  } else {
    const options = {
      method: "GET",
      headers: {
        Accept: "application/json",
        "x-api-key": process.env.UPSHOT_API_KEY,
      },
    };

    const url = "https://api.upshot.xyz/v2/collections/" + collection;

    const collectionResponse = await fetch(url, options).catch((err) =>
      console.error(err)
    );
    const collection = await collectionResponse.json();
    if (collection.data.floor !== undefined) {
      priceSum = BigNumber.from(collection.data.floor.wei)
        .mul(tokensIdsArray.length)
        .toString();
    }
  }

  if (requestId && priceSum != 0) {
    const payload = abi.encodeParameter(
      {
        AssetsPrice: {
          collection: "address",
          tokenIds: "uint256[]",
          amount: "uint256",
        },
      },
      {
        collection: collection,
        tokenIds: tokensIdsArray,
        amount: priceSum,
      }
    );

    //Sign the payload and build the packet
    const typedData = {
      types: {
        EIP712Domain: [
          { name: "name", type: "string" },
          { name: "version", type: "string" },
          { name: "chainId", type: "uint256" },
          { name: "verifyingContract", type: "address" },
        ],
        VerifyPacket: [
          { name: "request", type: "bytes32" },
          { name: "deadline", type: "uint256" },
          { name: "payload", type: "bytes" },
        ],
      },
      primaryType: "VerifyPacket",
      domain: {
        name: "leNFT",
        version: "1",
        chainId: chainId,
        verifyingContract: addresses.NFTOracle,
      },
      message: {
        request: requestId,
        deadline: expiryTimestamp,
        payload: payload,
      },
    };

    const signingKey = new utils.SigningKey(process.env.SERVER_PRIVATE_KEY);

    // Get a signable message from the typed data
    const message = getMessage(typedData, true);

    // Sign the message with the private key
    const { r, s, v } = signingKey.signDigest(message);

    const sigPacket = {
      v: v,
      r: r,
      s: s,
      request: requestId,
      deadline: expiryTimestamp,
      payload: payload,
    };

    res.status(200).json({ sig: sigPacket, price: priceSum });
  } else {
    res.status(200).json({ price: priceSum });
  }
}

export async function getAddressNFTs(req, res) {
  const { address, collection, chainId } = req.query;

  var chainName;
  console.log(chainId);
  if (chainId == 1) {
    chainName = "eth";
  } else if (chainId == 5) {
    chainName = "goerli";
  } else {
    res.status(400).json({ error: "Invalid chainId" });
  }

  var collectionsURLString = "";
  if (collection) {
    collectionsURLString = "&contractAddresses[]=" + collection;
  }

  const url =
    "https://eth-" +
    chainName +
    ".g.alchemy.com/nft/v2/" +
    process.env.ALCHEMY_API_KEY +
    "/getNFTs";

  const options = {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  };

  var nextPageExists = true;
  var returnNFTs = [];
  var pageKey;
  var nftsPageResponse = {};
  var pageKeyURLString;

  while (nextPageExists) {
    pageKeyURLString = "";

    if (nextPageExists) {
      pageKeyURLString = "&pageKey=" + pageKey;
    }
    nftsPageResponse = await fetch(
      url + "?owner=" + address + collectionsURLString + pageKeyURLString,
      options
    ).catch((err) => console.error(err));
    const nftsPage = await nftsPageResponse.json();

    // Merge the arrays
    returnNFTs = returnNFTs.concat(nftsPage.ownedNfts);

    if (nftsPage.pageKey !== undefined) {
      pageKey = nftsPage.pageKey;
      nextPageExists = true;
    } else {
      nextPageExists = false;
    }
  }

  console.log("nfts", returnNFTs);

  res.status(200).json(returnNFTs);
}

export async function getAddressCollections(req, res) {
  const { address, chainId } = req.query;

  var chainName;
  console.log(chainId);
  if (chainId == 1) {
    chainName = "eth";
  } else if (chainId == 5) {
    chainName = "goerli";
  } else {
    res.status(400).json({ error: "Invalid chainId" });
  }

  const url =
    "https://eth-" +
    chainName +
    ".g.alchemy.com/nft/v2/" +
    process.env.ALCHEMY_API_KEY +
    "/getContractsForOwner";

  const options = {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  };
  const getNFTCollectionsResponse = await fetch(
    url + "?owner=" + address,
    options
  ).catch((err) => console.error(err));
  const nftCollections = await getNFTCollectionsResponse.json();

  console.log("nftCollections", nftCollections.contracts);

  res.status(200).json(nftCollections.contracts);
}
