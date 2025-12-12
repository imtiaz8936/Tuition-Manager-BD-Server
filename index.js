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

// stripe-key
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

async function run() {
  try {
    await client.connect();

    const db = client.db("tuition_managerbd");
    const usersCollection = db.collection("users");
    const tuitionsCollection = db.collection("tuitions");
    const tutorApllicationsCollection = db.collection("tutor_applications");
    const paymentCollection = db.collection("payments");

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

    app.get("/tuition-applications", async (req, res) => {
      const email = req.query.email;
      const query = {};
      if (email) {
        query.student_email = email;
      }
      const result = await tutorApllicationsCollection.find(query).toArray();
      res.send(result);
    });

    // payment related apis
    app.post("/payment-checkout-session", async (req, res) => {
      const paymentInfo = req.body;
      const amount = Number(paymentInfo.salary) * 100;

      const session = await stripe.checkout.sessions.create({
        line_items: [
          {
            price_data: {
              currency: "BDT",
              unit_amount: amount,
              product_data: {
                name: `Please, pay for your tutor: ${paymentInfo.name}`,
              },
            },
            quantity: 1,
          },
        ],
        customer_email: paymentInfo.email,
        mode: "payment",
        metadata: {
          tuitionId: paymentInfo.tuitionId,
          applicationId: paymentInfo.applicationId,
          payee_name: paymentInfo.name,
        },
        success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-cancelled`,
      });

      res.send({ url: session.url });
    });

    app.patch("/payment-success", async (req, res) => {
      const sessionId = req.query.session_id;
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      console.log(session);

      const transactionId = session.payment_intent;
      const query = { transactionId: transactionId };

      const paymentExist = await paymentCollection.findOne(query);
      console.log(paymentExist);
      if (paymentExist) {
        return res.send({
          message: "already exists",
          transactionId,
          trackingId: paymentExist.trackingId,
        });
      }

      if (session.payment_status === "paid") {
        const id = session.metadata.applicationId;
        const query = { _id: new ObjectId(id) };
        const update = {
          $set: {
            status: "Approved",
          },
        };

        const result = await tutorApllicationsCollection.updateOne(
          query,
          update
        );

        const payment = {
          amount: session.amount_total / 100,
          currency: session.currency,
          customer_email: session.customer_email,
          applicationId: session.metadata.applicationId,
          tuitionId: session.metadata.tuitionId,
          payee_name: session.metadata.payee_name,
          transactionId: session.payment_intent,
          paymentStatus: session.payment_status,
          paidAt: new Date(),
        };

        if (session.payment_status === "paid") {
          const resultPayment = await paymentCollection.insertOne(payment);

          res.send({
            success: true,
            modifyParcel: result,
            transactionId: session.payment_intent,
            paymentInfo: resultPayment,
          });
        }
      }
      res.send({ success: false });
    });

    // tutor related apis
    app.post("/tutor-application", async (req, res) => {
      const applicationData = req.body;
      applicationData.status = "Pending";
      const result = await tutorApllicationsCollection.insertOne(
        applicationData
      );
      res.send(result);
    });

    app.get("/my-applications", async (req, res) => {
      const email = req.query.email;
      const query = {};
      if (email) {
        query.email = email;
      }
      const result = await tutorApllicationsCollection.find(query).toArray();
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
