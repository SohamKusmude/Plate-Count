require("dotenv").config();

const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const User = require("../src/models/User");

async function seedAdmin() {
  const { MONGODB_URI, ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
  if (!MONGODB_URI) throw new Error("Set MONGODB_URI before creating the first admin.");
  if (!ADMIN_NAME || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
    throw new Error("Set ADMIN_NAME, ADMIN_EMAIL and ADMIN_PASSWORD before creating the first admin.");
  }
  if (Buffer.byteLength(ADMIN_PASSWORD, "utf8") < 14 || Buffer.byteLength(ADMIN_PASSWORD, "utf8") > 72) {
    throw new Error("ADMIN_PASSWORD must be between 14 and 72 bytes.");
  }

  await mongoose.connect(MONGODB_URI);
  try {
    await User.init();
    const email = ADMIN_EMAIL.trim().toLowerCase();
    const existing = await User.findOne({ email }).select("_id");
    if (existing) throw new Error(`An account already exists for ${email}; no admin was created.`);
    const user = await User.create({
      name: ADMIN_NAME.trim(),
      email,
      role: "admin",
      passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 12)
    });
    console.log(`Administrator created: ${user.email}`);
  } finally {
    await mongoose.disconnect();
  }
}

seedAdmin().catch(error => {
  console.error("Could not create the administrator:", error.message);
  process.exitCode = 1;
});
