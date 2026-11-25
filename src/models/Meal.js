const mongoose = require("mongoose");
const { MEAL_TYPES } = require("../domain/meals");

const mealSchema = new mongoose.Schema({
  date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  type: { type: String, enum: MEAL_TYPES, required: true },
  menu: { type: String, required: true, trim: true, maxlength: 500 },
  cutoffAt: { type: Date, required: true },
  servingStartAt: { type: Date, required: true },
  servingEndAt: { type: Date, required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }
}, { timestamps: true });

mealSchema.index({ date: 1, type: 1 }, { unique: true });

module.exports = mongoose.model("Meal", mealSchema);
