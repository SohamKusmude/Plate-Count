const express = require("express");
const mongoose = require("mongoose");
const Meal = require("../models/Meal");
const MealResponse = require("../models/MealResponse");
const User = require("../models/User");
const { dateInTimeZone, expectedHeadcount, isDateKey, servingStatus } = require("../domain/meals");
const { HttpError, requireRole } = require("../middleware/http");
const { ensureMeals } = require("./meals");
const config = require("../config");

const router = express.Router();

router.get("/", requireRole("cook", "admin"), async (req, res) => {
  const date = req.query.date || dateInTimeZone(config.timeZone);
  if (!isDateKey(date)) throw new HttpError(400, "Date must use YYYY-MM-DD format.");
  const meals = await ensureMeals(date, config.timeZone);
  const [residentCount, responses] = await Promise.all([
    User.countDocuments({ role: "resident", active: true }),
    MealResponse.find({ mealId: { $in: meals.map(meal => meal.id) } })
      .select("mealId userId status checkedInAt")
      .populate({ path: "userId", select: "name residenceBlock" })
  ]);
  const counts = meals.map(meal => {
    const rows = responses.filter(response => response.mealId.equals(meal.id));
    const skippingCount = rows.filter(response => response.status === "skipping").length;
    const expectedCount = expectedHeadcount(residentCount, skippingCount);
    const checkedInCount = rows.filter(response => Boolean(response.checkedInAt)).length;
    const ended = meal.servingEndAt.getTime() <= Date.now();
    return {
      mealId: meal.id,
      type: meal.type,
      menu: meal.menu,
      cutoffAt: meal.cutoffAt,
      servingStartAt: meal.servingStartAt,
      servingEndAt: meal.servingEndAt,
      servingStatus: servingStatus(meal),
      prepCompletedAt: meal.prepCompletedAt,
      servingCompletedAt: meal.servingCompletedAt,
      residentCount,
      responseCount: rows.length,
      expectedCount,
      checkedInCount,
      noShowCount: ended ? Math.max(0, expectedCount - checkedInCount) : null
    };
  });
  const totalExpected = counts.reduce((total, meal) => total + meal.expectedCount, 0);
  const recentCheckIns = responses
    .filter(response => response.checkedInAt && response.userId)
    .sort((left, right) => right.checkedInAt - left.checkedInAt)
    .slice(0, 8)
    .map(response => ({
      name: response.userId.name,
      residenceBlock: response.userId.residenceBlock,
      checkedInAt: response.checkedInAt,
      mealType: meals.find(meal => meal.id === response.mealId.toString())?.type
    }));
  return res.json({
    date,
    timeZone: config.timeZone,
    residentCount,
    responseRate: residentCount === 0 || counts.length === 0
      ? 0
      : Math.round(counts.reduce((sum, meal) => sum + meal.responseCount, 0) / (residentCount * counts.length) * 100),
    totalExpected,
    recentCheckIns,
    meals: counts
  });
});

router.post("/:mealId/prep-complete", requireRole("cook", "admin"), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.mealId)) throw new HttpError(400, "Meal ID is invalid.");
  const meal = await Meal.findById(req.params.mealId);
  if (!meal) throw new HttpError(404, "Meal was not found.");
  if (!meal.prepCompletedAt) {
    meal.prepCompletedAt = new Date();
    await meal.save();
  }
  return res.json({ prepCompletedAt: meal.prepCompletedAt });
});

router.post("/:mealId/serving-complete", requireRole("cook", "admin"), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.mealId)) throw new HttpError(400, "Meal ID is invalid.");
  const meal = await Meal.findById(req.params.mealId);
  if (!meal) throw new HttpError(404, "Meal was not found.");
  if (Date.now() < meal.servingEndAt.getTime()) {
    throw new HttpError(409, "Serving can only be marked complete after its scheduled end time.");
  }
  if (!meal.servingCompletedAt) {
    meal.servingCompletedAt = new Date();
    await meal.save();
  }
  return res.json({ servingCompletedAt: meal.servingCompletedAt });
});

module.exports = router;
