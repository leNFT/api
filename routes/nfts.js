import express from "express";
var router = express.Router();
import {
  getImageURL,
  getFloorPrice,
  getPrice,
  getAddressNFTs,
  getAddressCollections,
} from "../controllers/nfts.js";

router.get("/floorPrice", getFloorPrice);
router.get("/price", getPrice);
router.get("/address", getAddressNFTs);
router.get("/addressCollections", getAddressCollections);
router.get("/imageURL", getImageURL);

export default router;
