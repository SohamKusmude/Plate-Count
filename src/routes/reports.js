const express = require("express");
const Meal = require("../models/Meal");
const MealResponse = require("../models/MealResponse");
const User = require("../models/User");
const WasteLog = require("../models/WasteLog");
const { dateInTimeZone, expectedHeadcount, isDateKey } = require("../domain/meals");
const { HttpError, requireRole } = require("../middleware/http");
const config = require("../config");
const { ensureMeals } = require("./meals");

const router = express.Router();

router.get("/", requireRole("admin"), async (req, res) => {
  const to = req.query.to || dateInTimeZone(config.timeZone);
  if (!isDateKey(to)) throw new HttpError(400, "Provide a valid report end date.");
  const from = req.query.from || (() => {
    const date = new Date(`${to}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() - 6);
    return date.toISOString().slice(0, 10);
  })();
  if (!isDateKey(from) || from > to) {
    throw new HttpError(400, "Provide a valid date range.");
  }
  const dayCount = (Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / 86400000 + 1;
  if (dayCount > 90) throw new HttpError(400, "Report ranges cannot exceed 90 days.");

  const dates = [];
  for (let index = 0; index < dayCount; index += 1) {
    const date = new Date(`${from}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + index);
    dates.push(date.toISOString().slice(0, 10));
  }
  const [mealRows, residentCount] = await Promise.all([
    Meal.find({ date: { $gte: from, $lte: to } }),
    User.countDocuments({ role: "resident", active: true })
  ]);
  const mealDatesMissing = dates.filter(date => !mealRows.some(meal => meal.date === date));
  if (mealDatesMissing.includes(to)) {
    const meals = await ensureMeals(to, config.timeZone);
    mealRows.push(...meals.filter(meal => !mealRows.some(existing => existing.id === meal.id)));
  }
  const mealIds = mealRows.map(meal => meal.id);
  const [responses, wasteRows] = await Promise.all([
    MealResponse.find({ mealId: { $in: mealIds } }).select("mealId status checkedInAt"),
    WasteLog.find({ mealId: { $in: mealIds } }).populate({ path: "mealId", select: "date type" }).sort({ createdAt: -1 }).limit(250)
  ]);
  const responseStats = new Map();
  for (const response of responses) {
    const key = response.mealId.toString();
    const stats = responseStats.get(key) || { skipping: 0, checkedIn: 0 };
    if (response.status === "skipping") stats.skipping += 1;
    if (response.checkedInAt) stats.checkedIn += 1;
    responseStats.set(key, stats);
  }
  const wasteByDate = new Map();
  for (const row of wasteRows) {
    if (!row.mealId) continue;
    wasteByDate.set(row.mealId.date, (wasteByDate.get(row.mealId.date) || 0) + row.wastedKg);
  }
  const now = Date.now();
  const daily = dates.map(date => {
    const dayMeals = mealRows.filter(meal => meal.date === date);
    let expected = 0;
    let completedExpected = 0;
    let checkedIn = 0;
    let noShows = 0;
    for (const meal of dayMeals) {
      const mealResponseStats = responseStats.get(meal.id) || { skipping: 0, checkedIn: 0 };
      const skipping = mealResponseStats.skipping;
      const mealExpected = expectedHeadcount(residentCount, skipping);
      const mealCheckedIn = mealResponseStats.checkedIn;
      expected += mealExpected;
      if (meal.servingEndAt.getTime() <= now) {
        completedExpected += mealExpected;
        checkedIn += mealCheckedIn;
        noShows += Math.max(0, mealExpected - mealCheckedIn);
      }
    }
    const wastedKg = wasteByDate.get(date) || 0;
    return {
      date,
      attendanceRate: completedExpected ? Math.round(checkedIn / completedExpected * 100) : 0,
      expected,
      completedExpected,
      checkedIn,
      noShows,
      wastedKg: Number(wastedKg.toFixed(2))
    };
  });
  const wasteLogs = wasteRows.filter(row => row.mealId).map(row => ({
    id: row.id,
    date: row.mealId.date,
    mealType: row.mealId.type,
    wastedKg: row.wastedKg,
    note: row.note,
    recordedAt: row.createdAt
  }));
  const summary = daily.reduce((total, day) => ({
    expected: total.expected + day.expected,
    completedExpected: total.completedExpected + day.completedExpected,
    checkedIn: total.checkedIn + day.checkedIn,
    noShows: total.noShows + day.noShows,
    wastedKg: total.wastedKg + day.wastedKg
  }), { expected: 0, completedExpected: 0, checkedIn: 0, noShows: 0, wastedKg: 0 });
  summary.attendanceRate = summary.completedExpected ? Math.round(summary.checkedIn / summary.completedExpected * 100) : 0;
  summary.wastedKg = Number(summary.wastedKg.toFixed(2));
  return res.json({ from, to, daily, summary, wasteLogs });
});

router.post("/waste", requireRole("cook", "admin"), async (req, res) => {
  const { mealId, wastedKg, note = "" } = req.body;
  if (typeof mealId !== "string" || !/^[a-f\d]{24}$/i.test(mealId)) throw new HttpError(400, "Choose a valid meal.");
  if (typeof wastedKg !== "number" || !Number.isFinite(wastedKg) || wastedKg < 0 || wastedKg > 10000) {
    throw new HttpError(400, "Waste must be a number from 0 to 10,000 kg.");
  }
  if (typeof note !== "string" || note.length > 300) throw new HttpError(400, "Waste note cannot exceed 300 characters.");
  const meal = await Meal.findById(mealId).select("_id");
  if (!meal) throw new HttpError(404, "Meal was not found.");
  const log = await WasteLog.create({ mealId, wastedKg, note: note.trim(), recordedBy: req.user.id });
  return res.status(201).json({ wasteLog: { id: log.id, mealId: log.mealId, wastedKg: log.wastedKg, note: log.note, recordedAt: log.createdAt } });
});

module.exports = router;
