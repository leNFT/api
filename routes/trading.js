import express from "express";
var router = express.Router();
import { getPools, getPoolHistory } from "../controllers/trading.js";

router.get("/pools", getPools);

router.get("/poolHistory", getPoolHistory);

export default router;
