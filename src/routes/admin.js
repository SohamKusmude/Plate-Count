const bcrypt = require("bcryptjs");
const express = require("express");
const Meal = require("../models/Meal");
const User = require("../models/User");
const { defaultMealsForDate, isDateKey, MEAL_TYPES } = require("../domain/meals");
const { HttpError, requireRole } = require("../middleware/http");

const router = express.Router();

function validDateTime(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

router.get("/users", requireRole("admin"), async (req, res) => {
  const [users, residents, cooks, admins] = await Promise.all([
    User.find({ active: true }).select("name email role residenceBlock createdAt").sort({ name: 1 }).limit(500),
    User.countDocuments({ active: true, role: "resident" }),
    User.countDocuments({ active: true, role: "cook" }),
    User.countDocuments({ active: true, role: "admin" })
  ]);
  return res.json({
    users,
    counts: { residents, kitchenTeam: cooks + admins, cooks, admins }
  });
});

router.post("/users", requireRole("admin"), async (req, res, next) => {
  try {
    const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
    const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const password = typeof req.body.password === "string" ? req.body.password : "";
    const role = req.body.role;
    const residenceBlock = typeof req.body.residenceBlock === "string" ? req.body.residenceBlock.trim() : "";
    if (name.length < 2 || name.length > 100) throw new HttpError(400, "Enter a name between 2 and 100 characters.");
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "Enter a valid email address.");
    if (!["resident", "cook", "admin"].includes(role)) throw new HttpError(400, "Choose a valid user role.");
    if (Buffer.byteLength(password, "utf8") < 10 || Buffer.byteLength(password, "utf8") > 72) {
      throw new HttpError(400, "Password must be at least 10 characters and no more than 72 bytes.");
    }

    const user = await User.create({
      name,
      email,
      role,
      residenceBlock: role === "resident" ? residenceBlock : "",
      passwordHash: await bcrypt.hash(password, 12)
    });
    return res.status(201).json({
      user: { id: user.id, name: user.name, email: user.email, role: user.role, residenceBlock: user.residenceBlock }
    });
  } catch (error) {
    if (error.code === 11000) return next(new HttpError(409, "An account with that email already exists."));
    return next(error);
  }
});

router.get("/meals", requireRole("admin"), async (req, res) => {
  const date = req.query.date;
  if (!isDateKey(date)) throw new HttpError(400, "Date must use YYYY-MM-DD format.");
  const meals = await Meal.find({ date }).sort({ cutoffAt: 1 });
  return res.json({ date, meals });
});

router.put("/meals/:type", requireRole("admin"), async (req, res) => {
  const { type } = req.params;
  const { date, menu, cutoffAt, servingStartAt, servingEndAt } = req.body;
  if (!MEAL_TYPES.includes(type)) throw new HttpError(400, "Meal type is invalid.");
  if (!isDateKey(date)) throw new HttpError(400, "Date must use YYYY-MM-DD format.");
  if (typeof menu !== "string" || !menu.trim() || menu.trim().length > 500) {
    throw new HttpError(400, "Menu description must be between 1 and 500 characters.");
  }
  if (![cutoffAt, servingStartAt, servingEndAt].every(validDateTime)) {
    throw new HttpError(400, "Provide valid cutoff and serving date-times.");
  }
  const schedule = {
    cutoffAt: new Date(cutoffAt),
    servingStartAt: new Date(servingStartAt),
    servingEndAt: new Date(servingEndAt)
  };
  if (schedule.cutoffAt >= schedule.servingStartAt || schedule.servingStartAt >= schedule.servingEndAt) {
    throw new HttpError(400, "Cutoff must be before serving, and serving end must follow its start.");
  }

  const existing = await Meal.findOne({ date, type });
  if (existing && Date.now() >= existing.cutoffAt.getTime()) {
    throw new HttpError(409, "This meal's cutoff has passed. Its schedule is locked.");
  }
  const meal = await Meal.findOneAndUpdate(
    { date, type },
    {
      $set: { menu: menu.trim(), ...schedule, updatedBy: req.user.id },
      $setOnInsert: { date, type }
    },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
  );
  return res.json({ meal });
});

module.exports = router;
