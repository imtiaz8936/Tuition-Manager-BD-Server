const express = require("express");
const app = express();
const cors = require("cors");
require("dotenv").config();
const port = process.env.PORT || 3000;

// middleware
app.use(cors());
app.use(express.json());

app.get("/server", (req, res) => {
  res.send("tuition-manager-bd-server is runninggg gooood");
});

app.listen(port, () => {
  console.log("tuition-manager-bd-server is running on port:", port);
});
