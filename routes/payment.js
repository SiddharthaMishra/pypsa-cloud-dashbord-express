const express = require("express");
const passport = require("passport");
const Razorpay = require("razorpay");
const Jobs = require("../models/Jobs");
const crypto = require("crypto");

const router = express.Router();

const instance = new Razorpay({
  key_id: process.env.RAZORPAY_API_KEY,
  key_secret: process.env.RAZORPAY_APT_SECRET,
});

async function generateAndUpdateOrderId(jobId, amount) {
  const options = {
    amount: Number(amount),
    currency: "INR",
  };
  const order = await instance.orders.create(options);

  await Jobs.findByIdAndUpdate(
    jobId,
    { order_id: order.id },
    { new: true, overwrite: true }
  );

  return order;
}

router.get(
  "/getCost",
  passport.authenticate("jwt_strategy", { session: false }),
  //   calculate cost here
  async (req, res, next) => {
    console.log("getCost");
    try {
      const cost = 400;

      const orderObj = await generateAndUpdateOrderId(req.query.jobId, cost);

      res
        .status(200)
        .send({ order_obj: orderObj, rozor_key: process.env.RAZORPAY_API_KEY });
    } catch (err) {
      console.log(err);
    }
  }
);

const paymentVerification = async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
    req.body;

  const body = razorpay_order_id + "|" + razorpay_payment_id;

  const expectedSignature = crypto
    .createHmac("sha256", process.env.RAZORPAY_APT_SECRET)
    .update(body.toString())
    .digest("hex");

  const isAuthentic = expectedSignature === razorpay_signature;

  console.log(req.body, isAuthentic, "paymentVerification");

  if (isAuthentic) {
    // Database comes here

    await Jobs.findOneAndUpdate(
      { order_id: razorpay_order_id },
      {
        status: "solving",
        payment_id: razorpay_payment_id,
        payment_signature: razorpay_signature,
      }
    );

    const baseUrl = process.env.BASE_FRONTEND_URL;

    res.redirect(`${baseUrl}/paymentsuccess?reference=${razorpay_payment_id}`);
  } else {
    res.status(400).json({
      success: false,
    });
  }
};

router.post("/verify", paymentVerification);

module.exports = router;
