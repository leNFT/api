import express from "express";
var router = express.Router();
import { getHistory } from "../controllers/lock.js";

router.get("/history", getHistory);

export default router;
