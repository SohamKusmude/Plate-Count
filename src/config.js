const config = {
  jwtSecret: process.env.JWT_SECRET,
  qrSecret: process.env.QR_SECRET,
  timeZone: process.env.APP_TIME_ZONE || "Asia/Kolkata",
  isProduction: process.env.NODE_ENV === "production"
};

module.exports = config;
