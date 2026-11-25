const path = require("node:path");
const express = require("express");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");
const mongoose = require("mongoose");
const { createAuthRouter } = require("./routes/auth");
const { router: mealRoutes } = require("./routes/meals");
const kitchenRoutes = require("./routes/kitchen");
const checkinRoutes = require("./routes/checkins");
const adminRoutes = require("./routes/admin");
const reportRoutes = require("./routes/reports");
const { authenticate } = require("./middleware/auth");
const { errorHandler } = require("./middleware/http");

function createApp(options = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"]
      }
    },
    crossOriginEmbedderPolicy: false
  }));
  app.use(express.json({ limit: "32kb" }));
  app.use((req, res, next) => {
    req.body = req.body || {};
    next();
  });
  app.use(cookieParser());

  app.get("/api/health", (req, res) => {
    const connected = mongoose.connection.readyState === 1;
    return res.status(connected ? 200 : 503).json({ status: connected ? "ok" : "database-unavailable" });
  });
  app.use("/api/auth", createAuthRouter(options));
  app.use("/api/meals", authenticate, mealRoutes);
  app.use("/api/kitchen", authenticate, kitchenRoutes);
  app.use("/api/check-ins", authenticate, checkinRoutes);
  app.use("/api/admin", authenticate, adminRoutes);
  app.use("/api/reports", authenticate, reportRoutes);

  app.get("/client.js", (req, res) => res.sendFile(path.resolve(__dirname, "..", "client.js")));
  app.get("/", (req, res) => res.sendFile(path.resolve(__dirname, "..", "index.html")));
  app.use("/api", (req, res) => res.status(404).json({ error: "API endpoint was not found." }));
  app.use((req, res) => res.status(404).send("Page not found."));
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
