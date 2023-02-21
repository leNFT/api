import express from "express";
var router = express.Router();
import { getPools } from "../controllers/trading.js";

router.get("/pools", getPools);

export default router;
