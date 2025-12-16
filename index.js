const express = require("express");
const app = express();
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();
const admin = require("firebase-admin");
const port = process.env.PORT || 3000;

const serviceAccount = require("./tuition-manager-bd-firebase-adminsdk.json");
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// middleware
app.use(cors());
app.use(express.json());

// custom middlewares
const verifyJWT = async (req, res, next) => {
  const token = req?.headers?.authorization?.split(" ")[1];
  console.log(token);
  if (!token) return res.status(401).send({ message: "Unauthorized Access!" });
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.tokenEmail = decoded.email;
    console.log(decoded);
    next();
  } catch (err) {
    console.log(err);
    return res.status(401).send({ message: "Unauthorized Access!", err });
  }
};

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

    // custom middlewares for role verification
    const verifyADMIN = async (req, res, next) => {
      const email = req.tokenEmail;
      const user = await usersCollection.findOne({ email });
      if (user?.role !== "Admin")
        return res
          .status(403)
          .send({ message: "Admin only Actions!", role: user?.role });

      next();
    };

    const verifyTUTOR = async (req, res, next) => {
      const email = req.tokenEmail;
      const user = await usersCollection.findOne({ email });
      if (user?.role !== "Tutor")
        return res
          .status(403)
          .send({ message: "Tutor only Actions!", role: user?.role });

      next();
    };

    const verifySTUDENT = async (req, res, next) => {
      const email = req.tokenEmail;
      const user = await usersCollection.findOne({ email });
      if (user?.role !== "Student")
        return res
          .status(403)
          .send({ message: "Student only Actions!", role: user?.role });

      next();
    };

    // role related apis
    app.get("/user/role", verifyJWT, async (req, res) => {
      const email = req.query.email;
      const query = {};
      if (email) {
        query.email = email;
      }
      const result = await usersCollection.findOne(query);
      res.send(result);
    });

    // user-info related apis
    app.post("/signup", async (req, res) => {
      const userData = req.body;
      if (userData.role === "Tutor") {
        userData.created_at = new Date();
      }
      const result = await usersCollection.insertOne(userData);
      res.send(result);
    });

    app.get("/user/:userId", async (req, res) => {
      const userId = req.params.userId;
      const result = await usersCollection.findOne({
        _id: new ObjectId(userId),
      });
      res.send(result);
    });

    // tuitions related apis
    app.post("/create-tuition", verifyJWT, verifySTUDENT, async (req, res) => {
      const tuition = req.body;
      tuition.status = "Pending";
      tuition.created_at = new Date();
      const result = await tuitionsCollection.insertOne(tuition);
      res.send(result);
    });

    app.get("/tuitions", verifyJWT, async (req, res) => {
      const { email, subject, location, sort, page, limit } = req.query;

      let query = {
        status: "Approved",
      };

      if (email) {
        if (email !== req.tokenEmail) {
          res.status(401).send({ message: "Unauthorized Access" });
        }
        query.email = email;
      }

      if (subject) {
        query.subject = { $regex: subject, $options: "i" };
      }

      if (location) {
        query.location = { $regex: location, $options: "i" };
      }

      let sortOption = {};
      if (sort === "budget_asc") sortOption.budget = 1;
      if (sort === "budget_desc") sortOption.budget = -1;
      if (sort === "date_new") sortOption.created_at = -1;
      if (sort === "date_old") sortOption.created_at = 1;

      // 📄 Pagination
      const pageNumber = parseInt(page);
      const pageLimit = parseInt(limit);
      const skip = (pageNumber - 1) * pageLimit;

      const result = await tuitionsCollection
        .find(query)
        .sort(sortOption)
        .skip(skip)
        .limit(pageLimit)
        .toArray();

      // Total count
      const total = await tuitionsCollection.countDocuments(query);

      res.send({
        data: result,
        total,
        page: pageNumber,
        totalPages: Math.ceil(total / pageLimit),
      });
    });

    app.get("/tuition-details/:id", async (req, res) => {
      const id = req.params.id;
      const result = await tuitionsCollection.findOne({
        _id: new ObjectId(id),
      });
      res.send(result);
    });

    app.patch("/update-tuition/:id", verifySTUDENT, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const update = {
        $set: req.body,
      };
      const result = await tuitionsCollection.updateOne(query, update);
      res.send(result);
    });

    app.delete("/delete-tuition/:id", verifySTUDENT, async (req, res) => {
      const id = req.params.id;
      const result = await tuitionsCollection.deleteOne({
        _id: new ObjectId(id),
      });
      res.send(result);
    });

    app.get(
      "/tuition-applications",
      verifyJWT,
      verifySTUDENT,
      async (req, res) => {
        const email = req.query.email;
        const query = {};
        if (email) {
          query.student_email = email;
        }
        const result = await tutorApllicationsCollection.find(query).toArray();
        res.send(result);
      }
    );

    app.get("/latest-tuitions", async (req, res) => {
      const result = await tuitionsCollection
        .find()
        .sort({ created_at: -1 })
        .limit(6)
        .toArray();
      res.send(result);
    });

    app.get(
      "/total-payments/student",
      verifyJWT,
      verifySTUDENT,
      async (req, res) => {
        const email = req.query.email;
        console.log(email);
        try {
          const result = await paymentCollection
            .aggregate([
              {
                $match: { payer_email: email },
              },
              {
                $group: {
                  _id: null,
                  totalRevenue: { $sum: "$amount" },
                },
              },
            ])
            .toArray();

          const totalRevenue = result[0]?.totalRevenue || 0;

          res.send({ totalRevenue });
        } catch (error) {
          res.status(500).send({ message: "Failed to calculate revenue" });
        }
      }
    );

    app.get(
      "/dashboard-stats/student",
      verifyJWT,
      verifySTUDENT,
      async (req, res) => {
        const email = req.query.email;
        const [totalApplications, approvedTutors, createdTuitions] =
          await Promise.all([
            tutorApllicationsCollection.countDocuments({
              student_email: email,
            }),
            tutorApllicationsCollection.countDocuments({
              student_email: email,
              status: "Approved",
            }),
            tuitionsCollection.countDocuments({ email: email }),
          ]);

        res.send({
          totalApplications,
          approvedTutors,
          createdTuitions,
        });
      }
    );

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
          payer_email: paymentInfo.student_email,
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
          payer_email: session.metadata.payer_email,
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

    app.get("/payment-history", async (req, res) => {
      const email = req.query.email;
      const role = req.query.role;
      const query = {};
      if (email) {
        if (role === "Student") {
          query.payer_email = email;
        } else {
          query.customer_email = email;
        }
      }
      const result = await paymentCollection
        .find(query)
        .sort({ paidAt: -1 })
        .toArray();
      res.send(result);
    });

    // tutor related apis
    app.post("/tutor-application", verifyJWT, verifyTUTOR, async (req, res) => {
      const applicationData = req.body;
      applicationData.status = "Pending";
      const result = await tutorApllicationsCollection.insertOne(
        applicationData
      );
      res.send(result);
    });

    app.get("/my-applications", verifyJWT, verifyTUTOR, async (req, res) => {
      const email = req.query.email;
      const query = {};
      if (email) {
        query.email = email;
      }
      const result = await tutorApllicationsCollection.find(query).toArray();
      res.send(result);
    });

    app.patch("/reject-application/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const update = {
        $set: {
          status: "Rejected",
        },
      };
      const result = await tutorApllicationsCollection.updateOne(query, update);
      res.send(result);
    });

    app.get("/latest-tutors", async (req, res) => {
      const result = await usersCollection
        .find({ role: "Tutor" })
        .sort({ created_at: -1 })
        .limit(6)
        .toArray();
      res.send(result);
    });

    app.get(
      "/total-earnings/tutor",
      verifyJWT,
      verifyTUTOR,
      async (req, res) => {
        const email = req.query.email;
        console.log(email);
        try {
          const result = await paymentCollection
            .aggregate([
              {
                $match: { customer_email: email },
              },
              {
                $group: {
                  _id: null,
                  totalRevenue: { $sum: "$amount" },
                },
              },
            ])
            .toArray();

          const totalRevenue = result[0]?.totalRevenue || 0;

          res.send({ totalRevenue });
        } catch (error) {
          res.status(500).send({ message: "Failed to calculate revenue" });
        }
      }
    );

    app.get(
      "/dashboard-stats/tutor",
      verifyJWT,
      verifyTUTOR,
      async (req, res) => {
        const email = req.query.email;
        const [totalApplications, approvedTuitions, availableTuitions] =
          await Promise.all([
            tutorApllicationsCollection.countDocuments({ email: email }),
            tutorApllicationsCollection.countDocuments({
              email: email,
              status: "Approved",
            }),
            tuitionsCollection.countDocuments({ status: "Approved" }),
          ]);

        res.send({
          totalApplications,
          approvedTuitions,
          availableTuitions,
        });
      }
    );

    // admin related apis
    app.get("/all-users", verifyJWT, verifyADMIN, async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });

    app.patch("/update-user-information/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const update = {
        $set: req.body,
      };
      const resul = await usersCollection.updateOne(query, update);
      res.send(resul);
    });

    app.delete("/delete-user-account/:id", async (req, res) => {
      const id = req.params.id;
      const result = await usersCollection.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    app.get("/tuitions/admin", verifyJWT, verifyADMIN, async (req, res) => {
      const { subject, location, sort, page, limit } = req.query;

      let query = {
        status: "Pending",
      };

      if (subject) {
        query.subject = { $regex: subject, $options: "i" };
      }

      if (location) {
        query.location = { $regex: location, $options: "i" };
      }

      let sortOption = {};
      if (sort === "budget_asc") sortOption.budget = 1;
      if (sort === "budget_desc") sortOption.budget = -1;
      if (sort === "date_new") sortOption.created_at = -1;
      if (sort === "date_old") sortOption.created_at = 1;

      // 📄 Pagination
      const pageNumber = parseInt(page);
      const pageLimit = parseInt(limit);
      const skip = (pageNumber - 1) * pageLimit;

      const result = await tuitionsCollection
        .find(query)
        .sort(sortOption)
        .skip(skip)
        .limit(pageLimit)
        .toArray();

      // Total count
      const total = await tuitionsCollection.countDocuments(query);

      res.send({
        data: result,
        total,
        page: pageNumber,
        totalPages: Math.ceil(total / pageLimit),
      });
    });

    app.get(
      "/approved-tuitions/admin",
      verifyJWT,
      verifyADMIN,
      async (req, res) => {
        const { subject, location, sort, page, limit } = req.query;

        let query = {
          status: "Approved",
        };

        if (subject) {
          query.subject = { $regex: subject, $options: "i" };
        }

        if (location) {
          query.location = { $regex: location, $options: "i" };
        }

        let sortOption = {};
        if (sort === "budget_asc") sortOption.budget = 1;
        if (sort === "budget_desc") sortOption.budget = -1;
        if (sort === "date_new") sortOption.created_at = -1;
        if (sort === "date_old") sortOption.created_at = 1;

        // 📄 Pagination
        const pageNumber = parseInt(page);
        const pageLimit = parseInt(limit);
        const skip = (pageNumber - 1) * pageLimit;

        const result = await tuitionsCollection
          .find(query)
          .sort(sortOption)
          .skip(skip)
          .limit(pageLimit)
          .toArray();

        // Total count
        const total = await tuitionsCollection.countDocuments(query);

        res.send({
          data: result,
          total,
          page: pageNumber,
          totalPages: Math.ceil(total / pageLimit),
        });
      }
    );

    app.patch("/update-tuition-status/admin/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const update = {
        $set: req.body,
      };
      const result = await tuitionsCollection.updateOne(query, update);
      res.send(result);
    });

    app.get(
      "/total-revenue/admin",
      verifyJWT,
      verifyADMIN,
      async (req, res) => {
        try {
          const result = await paymentCollection
            .aggregate([
              {
                $match: { paymentStatus: "paid" },
              },
              {
                $group: {
                  _id: null,
                  totalRevenue: { $sum: "$amount" },
                },
              },
            ])
            .toArray();

          const totalRevenue = result[0]?.totalRevenue || 0;

          res.send({ totalRevenue });
        } catch (error) {
          res.status(500).send({ message: "Failed to calculate revenue" });
        }
      }
    );

    app.get(
      "/dashboard-stats/admin",
      verifyJWT,
      verifyADMIN,
      async (req, res) => {
        const [totalUsers, totalTutors, totalTuitions] = await Promise.all([
          usersCollection.countDocuments(),
          usersCollection.countDocuments({ role: "Tutor" }),
          tuitionsCollection.countDocuments({ status: "Approved" }),
        ]);

        res.send({
          totalUsers,
          totalTutors,
          totalTuitions,
        });
      }
    );

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
