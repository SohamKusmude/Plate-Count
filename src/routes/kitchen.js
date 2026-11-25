const express = require("express");
const MealResponse = require("../models/MealResponse");
const User = require("../models/User");
const { dateInTimeZone, expectedHeadcount, isDateKey } = require("../domain/meals");
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

module.exports = router;
