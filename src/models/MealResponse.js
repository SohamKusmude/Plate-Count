const mongoose = require("mongoose");

const mealResponseSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  mealId: { type: mongoose.Schema.Types.ObjectId, ref: "Meal", required: true },
  status: { type: String, enum: ["eating", "skipping"], required: true },
  checkedInAt: { type: Date, default: null }
}, { timestamps: true });

mealResponseSchema.index({ userId: 1, mealId: 1 }, { unique: true });
mealResponseSchema.index({ mealId: 1, status: 1 });

module.exports = mongoose.model("MealResponse", mealResponseSchema);
