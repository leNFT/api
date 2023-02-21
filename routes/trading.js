import express from "express";
var router = express.Router();
import {
  getPools,
  getPoolHistory,
  getCollections,
} from "../controllers/trading.js";

router.get("/pools", getPools);

router.get("/poolHistory", getPoolHistory);

router.get("/collections", getCollections);

export default router;
