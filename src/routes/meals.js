const express = require("express");
const jwt = require("jsonwebtoken");
const QRCode = require("qrcode");
const config = require("../config");
const Meal = require("../models/Meal");
const MealResponse = require("../models/MealResponse");
const User = require("../models/User");
const { dateInTimeZone, defaultMealsForDate, expectedHeadcount, isDateKey, MEAL_TYPES } = require("../domain/meals");
const { HttpError, requireRole } = require("../middleware/http");

const router = express.Router();

function readDate(value, timeZone) {
  const date = value || dateInTimeZone(timeZone);
  if (!isDateKey(date)) throw new HttpError(400, "Date must use YYYY-MM-DD format.");
  return date;
}

async function ensureMeals(date, timeZone) {
  const defaults = defaultMealsForDate(date, timeZone);
  try {
    await Meal.bulkWrite(defaults.map(meal => ({
      updateOne: {
        filter: { date: meal.date, type: meal.type },
        update: { $setOnInsert: meal },
        upsert: true
      }
    })), { ordered: false });
  } catch (error) {
    const duplicateOnly = error.code === 11000 ||
      (Array.isArray(error.writeErrors) && error.writeErrors.length > 0 &&
        error.writeErrors.every(writeError => writeError.code === 11000));
    if (!duplicateOnly || await Meal.countDocuments({ date }) !== defaults.length) throw error;
  }
  return Meal.find({ date }).sort({ cutoffAt: 1 });
}

router.get("/", async (req, res) => {
  const date = readDate(req.query.date, config.timeZone);
  const meals = await ensureMeals(date, config.timeZone);
  const mealIds = meals.map(meal => meal._id);
  const [responses, residentCount] = await Promise.all([
    MealResponse.find({ mealId: { $in: mealIds } }).select("userId mealId status checkedInAt"),
    req.user.role === "resident" ? Promise.resolve(null) : User.countDocuments({ role: "resident", active: true })
  ]);
  const responseByMealAndUser = new Map(responses.map(response => [`${response.mealId}:${response.userId}`, response]));
  const items = meals.map(meal => {
    const mealResponses = responses.filter(response => response.mealId.equals(meal._id));
    const skippingCount = mealResponses.filter(response => response.status === "skipping").length;
    const checkedInCount = mealResponses.filter(response => response.checkedInAt).length;
    const item = {
      id: meal.id,
      date: meal.date,
      type: meal.type,
      menu: meal.menu,
      cutoffAt: meal.cutoffAt,
      choicesLocked: Boolean(meal.choicesLockedAt),
      servingStartAt: meal.servingStartAt,
      servingEndAt: meal.servingEndAt,
      myResponse: responseByMealAndUser.get(`${meal.id}:${req.user.id}`)?.status || null,
      myCheckedInAt: responseByMealAndUser.get(`${meal.id}:${req.user.id}`)?.checkedInAt || null
    };
    if (req.user.role !== "resident") {
      item.expectedCount = expectedHeadcount(residentCount, skippingCount);
      item.checkedInCount = checkedInCount;
      item.residentCount = residentCount;
      item.responseCount = mealResponses.length;
    }
    return item;
  });
  return res.json({ date, timeZone: config.timeZone, meals: items });
});

router.post("/:mealId/response", requireRole("resident"), async (req, res, next) => {
  try {
    if (!mongooseObjectId(req.params.mealId)) throw new HttpError(400, "Meal ID is invalid.");
    const { status } = req.body;
    if (status !== "eating" && status !== "skipping") throw new HttpError(400, "Choose eating or skipping.");
    const meal = await Meal.findById(req.params.mealId);
    if (!meal) throw new HttpError(404, "Meal was not found.");
    if (meal.choicesLockedAt || Date.now() >= meal.cutoffAt.getTime()) {
      throw new HttpError(409, "The cutoff has passed. This meal choice is locked.");
    }

    const response = await MealResponse.findOneAndUpdate(
      { userId: req.user.id, mealId: meal.id },
      { $set: { status } },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
    );
    return res.json({ response: { status: response.status, mealId: meal.id } });
  } catch (error) {
    if (error.code === 11000) {
      const response = await MealResponse.findOneAndUpdate(
        { userId: req.user.id, mealId: req.params.mealId },
        { $set: { status: req.body.status } },
        { new: true, runValidators: true }
      );
      if (response) return res.json({ response: { status: response.status, mealId: response.mealId } });
    }
    return next(error);
  }
});

router.get("/history", requireRole("resident"), async (req, res) => {
  const responses = await MealResponse.find({ userId: req.user.id })
    .sort({ createdAt: -1 })
    .limit(100)
    .populate({ path: "mealId", select: "date type menu servingEndAt" });
  const now = Date.now();
  const items = responses.filter(response => response.mealId).map(response => {
    const meal = response.mealId;
    const isPastMeal = meal.servingEndAt.getTime() < now;
    return {
      date: meal.date,
      mealType: meal.type,
      menu: meal.menu,
      status: response.status,
      checkedInAt: response.checkedInAt,
      attendance: response.checkedInAt ? "checked-in" : isPastMeal && response.status === "eating" ? "no-show" : "pending"
    };
  });
  return res.json({ history: items });
});

router.get("/:mealType/pass", requireRole("resident"), async (req, res) => {
  const mealType = req.params.mealType;
  if (!MEAL_TYPES.includes(mealType)) throw new HttpError(400, "Meal type is invalid.");
  const date = readDate(req.query.date, config.timeZone);
  const meals = await ensureMeals(date, config.timeZone);
  const meal = meals.find(item => item.type === mealType);
  if (!meal) throw new HttpError(404, "Meal was not found.");
  const existing = await MealResponse.findOne({ userId: req.user.id, mealId: meal.id });
  if (existing?.status === "skipping") throw new HttpError(409, "You marked this meal as skipping, so a pass is unavailable.");
  if (Date.now() >= meal.servingEndAt.getTime()) throw new HttpError(409, "This meal's check-in window has closed.");

  const token = jwt.sign({
    sub: req.user.id,
    mealId: meal.id,
    scope: "meal-checkin",
    exp: Math.floor(meal.servingEndAt.getTime() / 1000),
    nbf: Math.floor(meal.servingStartAt.getTime() / 1000)
  }, config.qrSecret, {
    algorithm: "HS256",
    issuer: "plate-count",
    audience: "plate-count-checkin"
  });
  const qrDataUrl = await QRCode.toDataURL(token, { errorCorrectionLevel: "M", margin: 2, width: 240 });
  return res.json({
    token,
    qrDataUrl,
    meal: { id: meal.id, type: meal.type, date: meal.date, menu: meal.menu, servingEndAt: meal.servingEndAt },
    checkedInAt: existing?.checkedInAt || null
  });
});

function mongooseObjectId(value) {
  return /^[a-f\d]{24}$/i.test(value);
}

module.exports = { ensureMeals, router };
