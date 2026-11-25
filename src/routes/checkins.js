const express = require("express");
const jwt = require("jsonwebtoken");
const Meal = require("../models/Meal");
const MealResponse = require("../models/MealResponse");
const User = require("../models/User");
const config = require("../config");
const { HttpError, requireRole } = require("../middleware/http");

const router = express.Router();

router.post("/scan", requireRole("cook", "admin"), async (req, res, next) => {
  try {
    const token = typeof req.body.token === "string" ? req.body.token : "";
    if (!token || token.length > 4096) throw new HttpError(400, "Provide a valid meal pass.");
    let pass;
    try {
      pass = jwt.verify(token, config.qrSecret, {
        algorithms: ["HS256"],
        issuer: "plate-count",
        audience: "plate-count-checkin"
      });
    } catch {
      throw new HttpError(400, "This meal pass is invalid or has expired.");
    }
    if (pass.scope !== "meal-checkin" || !pass.sub || !pass.mealId) {
      throw new HttpError(400, "This QR code is not a Plate Count meal pass.");
    }
    const [meal, resident] = await Promise.all([
      Meal.findById(pass.mealId),
      User.findOne({ _id: pass.sub, role: "resident", active: true }).select("_id")
    ]);
    if (!meal || !resident) throw new HttpError(400, "This meal pass is no longer valid.");
    const now = new Date();
    if (now < meal.servingStartAt || now >= meal.servingEndAt) {
      throw new HttpError(409, "Check-in is only available during the meal's serving window.");
    }

    const existing = await MealResponse.findOne({ userId: resident.id, mealId: meal.id });
    if (existing?.status === "skipping") throw new HttpError(409, "This resident marked the meal as skipping.");
    let response;
    try {
      response = await MealResponse.findOneAndUpdate(
        { userId: resident.id, mealId: meal.id, status: { $ne: "skipping" } },
        { $set: { checkedInAt: now }, $setOnInsert: { status: "eating" } },
        { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
      );
    } catch (error) {
      if (error.code !== 11000) throw error;
      response = await MealResponse.findOneAndUpdate(
        { userId: resident.id, mealId: meal.id, status: "eating" },
        { $set: { checkedInAt: now } },
        { new: true }
      );
      if (!response) throw new HttpError(409, "This meal cannot be checked in.");
    }
    return res.json({
      checkedIn: true,
      alreadyCheckedIn: Boolean(existing?.checkedInAt),
      checkedInAt: response.checkedInAt,
      meal: { date: meal.date, type: meal.type, menu: meal.menu }
    });
  } catch (error) { return next(error); }
});

module.exports = router;
