import express from "express";
import Cors from "cors";
import pkg from "body-parser";
const { json } = pkg;
import { config } from "dotenv";
config();
import initMiddleware from "./lib/init-middleware.js";
const app = express();

// Initialize the cors middleware
const cors = initMiddleware(
  // You can read more about the available options here: https://github.com/expressjs/cors#configuration-options
  Cors({
    // Only allow requests with GET and from the frontend
    methods: ["GET"],
    origin: [
      "https://lenft.finance",
      "http://localhost:3000",
      "https://lenft.fi",
    ],
  })
);

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
