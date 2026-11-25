const mongoose = require("mongoose");

const wasteLogSchema = new mongoose.Schema({
  mealId: { type: mongoose.Schema.Types.ObjectId, ref: "Meal", required: true },
  wastedKg: { type: Number, required: true, min: 0, max: 10000 },
  note: { type: String, trim: true, maxlength: 300, default: "" },
  recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }
}, { timestamps: true });

wasteLogSchema.index({ mealId: 1, createdAt: -1 });

module.exports = mongoose.model("WasteLog", wasteLogSchema);
