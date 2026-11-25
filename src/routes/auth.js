const bcrypt = require("bcryptjs");
const express = require("express");
const rateLimit = require("express-rate-limit");
const User = require("../models/User");
const { authenticate, clearSessionCookie, COOKIE_NAME, setSessionCookie } = require("../middleware/auth");
const { HttpError } = require("../middleware/http");

const router = express.Router();
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many sign-in attempts. Please wait a few minutes and try again." }
});

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    residenceBlock: user.residenceBlock
  };
}

router.post("/register", loginLimiter, async (req, res, next) => {
  try {
    const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
    const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const password = typeof req.body.password === "string" ? req.body.password : "";
    const residenceBlock = typeof req.body.residenceBlock === "string" ? req.body.residenceBlock.trim() : "";

    if (name.length < 2 || name.length > 100) throw new HttpError(400, "Enter a name between 2 and 100 characters.");
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "Enter a valid campus email address.");
    if (Buffer.byteLength(password, "utf8") < 10 || Buffer.byteLength(password, "utf8") > 72) {
      throw new HttpError(400, "Password must be at least 10 characters and no more than 72 bytes.");
    }
    if (residenceBlock.length > 80) throw new HttpError(400, "Residence block is too long.");

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({ name, email, passwordHash, residenceBlock, role: "resident" });
    setSessionCookie(res, user);
    return res.status(201).json({ user: publicUser(user) });
  } catch (error) {
    if (error.code === 11000) return next(new HttpError(409, "An account with that email already exists."));
    return next(error);
  }
});

router.post("/login", loginLimiter, async (req, res, next) => {
  try {
    const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const password = typeof req.body.password === "string" ? req.body.password : "";
    const user = await User.findOne({ email }).select("+passwordHash");
    if (!user || !user.active || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new HttpError(401, "Email or password is incorrect.");
    }
    setSessionCookie(res, user);
    return res.json({ user: publicUser(user) });
  } catch (error) {
    return next(error);
  }
});

router.post("/logout", (req, res) => {
  clearSessionCookie(res);
  return res.status(204).end();
});

router.get("/me", (req, res, next) => {
  if (!req.cookies[COOKIE_NAME]) return res.json({ user: null });
  return authenticate(req, res, next);
}, (req, res) => res.json({ user: publicUser(req.user) }));

module.exports = router;
