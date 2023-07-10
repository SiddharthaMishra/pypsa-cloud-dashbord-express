const express = require("express");
const router = express.Router();
const passport = require("passport");
const formData = require("express-form-data");
const multer = require("multer");
const gcp_storage = require("../config/index");
const error = require("mongoose/lib/error");
const bucket = gcp_storage.bucket("payment-dashboard");
const Jobs = require("../models/Jobs");
var ObjectId = require("mongoose").Types.ObjectId;
const { submitWorkflow } = require("../controller/k8s");

router.post(
  "/name",
  passport.authenticate("jwt_strategy", { session: false }),
  async (req, res, next) => {
    const job_obj = await Jobs.create({
      name: req.body.jobName,
      user_id: req.user._id,
    });
    res.send(job_obj);
  }
);

const multerMid = multer({
  storage: multer.memoryStorage({
    filename: (req, file, cb) => {
      //call the callback, passing it the original file name
      cb(null, req.query.file_name);
    },
  }),
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
});

const uploadConfig = (file, user, order_id, file_name) =>
  new Promise((resolve, reject) => {
    const { originalname, buffer } = file;

    const filepath = `${user.id}/${order_id}/configs/${file_name}.yaml`;
    console.log(user);
    const blob = bucket.file(filepath);
    const blobStream = blob.createWriteStream({
      resumable: false,
    });
    blobStream
      .on("finish", () => {
        const publicUrl = `https://storage.googleapis.com/${bucket.name}/${blob.name}`;

        resolve(publicUrl);
      })
      .on("error", (error) => {
        reject(error);
      })
      .end(buffer);
  });

async function updatefileUploadStatus(job_id, file_name) {
  await Jobs.updateOne({ _id: job_id }, { $set: { [file_name]: true } });
  const jobObj = await Jobs.findById(job_id);
  if (
    jobObj.config === true &&
    jobObj.bundle_config === true &&
    jobObj.powerplantmatching_config === true
  ) {
    const x = await Jobs.updateOne(
      { _id: new ObjectId(job_id) },
      { $set: { status: "pending" } },
      { new: true }
    );
    console.log("status all file", x);
  }
}

router.post(
  "/upload/config",
  passport.authenticate("jwt_strategy", { session: false }),
  multerMid.any(),
  async (req, res, next) => {
    try {
      const myFile = req.files[0];
      const fileUrl = await uploadConfig(
        myFile,
        req.user,
        req.query.job_id,
        req.query.file_name
      );
      const fname = req.query.file_name;
      await updatefileUploadStatus(req.query.job_id, fname);
      res.status(200).json({
        message: "Upload was successful",
        data: fileUrl,
      });
    } catch (err) {
      console.log(err);
    }
  }
);

router.get(
  "/name",
  passport.authenticate("jwt_strategy", { session: false }),
  async (req, res, next) => {
    const result = await Jobs.find({ name: req.query.jobName });
    res.send(result);
  }
);

router.get(
  "/userId",
  passport.authenticate("jwt_strategy", { session: false }),
  async (req, res, next) => {
    const result = await Jobs.find({ user_id: req.user._id });
    res.send(result);
  }
);

router.post(
  "/name/delete",
  passport.authenticate("jwt_strategy", { session: false }),
  async (req, res, next) => {
    console.log(req.body);
    const result = await Jobs.deleteMany({ name: { $in: req.body.job_names } });
    res.send(result);
  }
);

router.post("/submitworkflow",
  passport.authenticate("jwt_strategy", { session: false }),
  async (req, res, next) => {
    console.log(req.body)
    const orderId = req.body.job_id;
    const result = await Jobs.find({ _id: orderId });
    console.log(result);
    const userId = req.user._id;
    await submitWorkflow(userId, orderId, process.env["IMAGE_ID"]);
    res.status(200).send({})
  })



module.exports = router;
