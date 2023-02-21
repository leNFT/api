import express from "express";
var router = express.Router();

router.get("/", function (req, res) {
  res.send("Hello, World!");
});

export default router;
