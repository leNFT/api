import { Network } from "alchemy-sdk";
import { Alchemy } from "alchemy-sdk";
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

  if (nftMetadata.media[0].gateway) {
    res.status(200).json(nftMetadata.media[0].gateway);
  } else if (nftMetadata.tokenUri.gateway) {
    res.status(200).json(nftMetadata.tokenUri.gateway);
  } else {
    res.status(200).json("");
  }
}
