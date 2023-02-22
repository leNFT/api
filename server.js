import express from "express";
import cors from "cors";
import pkg from "body-parser";
const { json } = pkg;
import { config } from "dotenv";
config();
const app = express();

var corsOptions = {
  origin: "*",
  optionsSuccessStatus: 200, // some legacy browsers (IE11, various SmartTVs) choke on 204
};

// Middleware
app.use(cors(corsOptions)); // Enable Cross-Origin Resource Sharing (CORS)
app.use(json()); // Parse JSON request bodies

import defaultRoute from "./routes/index.js";
import tradingRoute from "./routes/trading.js";
import lendingRoute from "./routes/lending.js";
import gaugesRoute from "./routes/gauges.js";
import nftsRoute from "./routes/nfts.js";
import lockRoute from "./routes/lock.js";

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
