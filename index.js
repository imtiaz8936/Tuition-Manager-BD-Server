const express = require("express");
const app = express();
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();
const port = process.env.PORT || 3000;
// middleware
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.dbz4f6f.mongodb.net/?appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();

    const db = client.db("tuition_managerbd");
    const usersCollection = db.collection("users");
    const tuitionsCollection = db.collection("tuitions");

    // user-info related apis
    app.post("/signup", async (req, res) => {
      const userData = req.body;
      if (userData.role === "Tutor") {
        userData.created_at = new Date();
      }
      const result = await usersCollection.insertOne(userData);
      res.send(result);
    });

    // tuitions related apis
    app.post("/create-tuition", async (req, res) => {
      const tuition = req.body;
      tuition.created_at = new Date();
      const result = await tuitionsCollection.insertOne(tuition);
      res.send(result);
    });

    app.get("/tuitions", async (req, res) => {
      const email = req.query.email;
      const query = {};
      if (email) {
        query.email = email;
      }
      const result = await tuitionsCollection.find(query).toArray();
      res.send(result);
    });

    app.get("/tuition-details/:id", async (req, res) => {
      const id = req.params.id;
      const result = await tuitionsCollection.findOne({
        _id: new ObjectId(id),
      });
      res.send(result);
    });

    // role related apis
    app.get("/user/role", async (req, res) => {
      const email = req.query.email;
      const query = {};
      if (email) {
        query.email = email;
      }
      const result = await usersCollection.findOne(query);
      res.send(result);
    });

    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
  }
}
run().catch(console.dir);

app.get("/server", (req, res) => {
  res.send("tuition-manager-bd-server is runninggg gooood");
});

app.listen(port, () => {
  console.log("tuition-manager-bd-server is running on port:", port);
});
