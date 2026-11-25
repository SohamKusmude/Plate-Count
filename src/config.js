const config = {
  jwtSecret: process.env.JWT_SECRET,
  qrSecret: process.env.QR_SECRET,
  timeZone: process.env.APP_TIME_ZONE || "Asia/Kolkata",
  appBaseUrl: process.env.APP_BASE_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${process.env.PORT || 3000}`,
  isProduction: process.env.NODE_ENV === "production"
};

module.exports = config;
