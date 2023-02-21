import fetch from "node-fetch";

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
    url + "?contractAddress=" + address + "&tokenId=" + tokenId,
    options
  ).catch((err) => console.error(err));
  console.log(getNFTMetadataResponse);
  const nftMetadata = await getNFTMetadataResponse.json();

  if (nftMetadata.media[0].gateway) {
    res.status(200).json(nftMetadata.media[0].gateway);
  } else if (nftMetadata.tokenUri.gateway) {
    res.status(200).json(nftMetadata.tokenUri.gateway);
  } else {
    res.status(200).json("");
  }
}
