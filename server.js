import express from "express";
import pkg from "body-parser";
const { json } = pkg;
import { config } from "dotenv";
config();
const app = express();

// Middleware
app.use(json()); // Parse JSON request bodies

import defaultRoute from "./routes/index.js";
import tradingRoute from "./routes/trading.js";
import lendingRoute from "./routes/lending.js";
import gaugesRoute from "./routes/gauges.js";
import nftsRoute from "./routes/nfts.js";
import lockRoute from "./routes/lock.js";

app.use(function (req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept"
  );
  next();
});

app.use("/", defaultRoute);
app.use("/trading", tradingRoute);
app.use("/lending", lendingRoute);
app.use("/gauges", gaugesRoute);
app.use("/nfts", nftsRoute);
app.use("/lock", lockRoute);

// Start server
app.listen(8080, () => {
  console.log("Server started on port 8080");
});
