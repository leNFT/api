import express from "express";
var router = express.Router();
import { getImageURL } from "../controllers/nfts.js";

router.get("/imageURL", getImageURL);

export default router;
