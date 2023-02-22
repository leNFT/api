import express from "express";
var router = express.Router();
import { getGauges, getGaugeHistory } from "../controllers/gauges.js";

router.get("/", getGauges);

router.get("/history", getGaugeHistory);

export default router;
