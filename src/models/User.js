const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ["resident", "cook", "admin"], required: true, default: "resident" },
  residenceBlock: { type: String, trim: true, maxlength: 80, default: "" },
  active: { type: Boolean, default: true }
}, { timestamps: true });

userSchema.index({ role:  1, active: 1 });

module.exports = mongoose.model("User", userSchema);
