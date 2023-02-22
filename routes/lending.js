import express from "express";
var router = express.Router();
import { getPools, getCollections } from "../controllers/lending.js";

router.get("/pools", getPools);

router.get("/collections", getCollections);

export default router;
