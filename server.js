require("dotenv").config();

const mongoose = require("mongoose");
const { createApp } = require("./src/app");

function requiredSecret(name) {
  const value = process.env[name];
  if (!value || value.length < 32) {
    throw new Error(`${name} must be set to at least 32 characters.`);
  }
  return value;
}

async function start() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error("MONGODB_URI is required. Copy .env.example to .env and configure MongoDB.");
  }

  requiredSecret("JWT_SECRET");
  requiredSecret("QR_SECRET");
  await mongoose.connect(mongoUri);

  const app = createApp();
  const models = [
    require("./src/models/User"),
    require("./src/models/Meal"),
    require("./src/models/MealResponse"),
    require("./src/models/WasteLog")
  ];
  await Promise.all(models.map(model => model.init()));
  const port = Number(process.env.PORT || 3000);
  const server = app.listen(port, () => {
    console.log(`Plate Count listening on port ${port}`);
  });

  const shutdown = async () => {
    server.close(async () => {
      await mongoose.disconnect();
      process.exit(0);
    });
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

start().catch(error => {
  console.error("Plate Count failed to start:", error.message);
  process.exitCode = 1;
});
