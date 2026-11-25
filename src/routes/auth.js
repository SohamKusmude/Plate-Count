const bcrypt = require("bcryptjs");
const crypto = require("node:crypto");
const express = require("express");
const rateLimit = require("express-rate-limit");
const config = require("../config");
const User = require("../models/User");
const { authenticate, clearSessionCookie, COOKIE_NAME, setSessionCookie } = require("../middleware/auth");
const { HttpError } = require("../middleware/http");
const { isEmailConfigured, sendPasswordResetEmail } = require("../services/mailer");

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many sign-in attempts. Please wait a few minutes and try again." }
});
const resetRequestLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many password reset requests. Please wait and try again." }
});
const resetPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many password reset attempts. Please wait and try again." }
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

function createAuthRouter(options = {}) {
  const router = express.Router();
  const deliverPasswordResetEmail = options.sendPasswordResetEmail || sendPasswordResetEmail;

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

  router.post("/forgot-password", resetRequestLimiter, async (req, res) => {
    if (!isEmailConfigured() && !options.sendPasswordResetEmail) {
      throw new HttpError(503, "Password recovery email is not configured. Please contact your administrator.");
    }
    const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new HttpError(400, "Enter a valid email address.");
    }
    const user = await User.findOne({ email, active: true });
    if (user) {
      const token = crypto.randomBytes(32).toString("hex");
      user.passwordResetTokenHash = crypto.createHash("sha256").update(token).digest("hex");
      user.passwordResetExpiresAt = new Date(Date.now() + 60 * 60 * 1000);
      await user.save();
      const resetUrl = new URL("/", config.appBaseUrl);
      resetUrl.searchParams.set("reset", token);
      try {
        await deliverPasswordResetEmail({ to: user.email, name: user.name, resetUrl: resetUrl.toString() });
      } catch (error) {
        await User.updateOne(
          { _id: user._id, passwordResetTokenHash: user.passwordResetTokenHash },
          { $unset: { passwordResetTokenHash: 1, passwordResetExpiresAt: 1 } }
        );
        throw error;
      }
    }
    return res.status(202).json({
      message: "If an active account uses that email, a password reset link will be sent."
    });
  });

  router.post("/reset-password", resetPasswordLimiter, async (req, res) => {
    const token = typeof req.body.token === "string" ? req.body.token : "";
    const password = typeof req.body.password === "string" ? req.body.password : "";
    if (!/^[a-f0-9]{64}$/.test(token)) throw new HttpError(400, "This password reset link is invalid or has expired.");
    if (Buffer.byteLength(password, "utf8") < 10 || Buffer.byteLength(password, "utf8") > 72) {
      throw new HttpError(400, "Password must be at least 10 characters and no more than 72 bytes.");
    }
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const user = await User.findOne({
      passwordResetTokenHash: tokenHash,
      passwordResetExpiresAt: { $gt: new Date() },
      active: true
    }).select("+passwordResetTokenHash +passwordResetExpiresAt");
    if (!user) throw new HttpError(400, "This password reset link is invalid or has expired.");
    const passwordHash = await bcrypt.hash(password, 12);
    const updatedUser = await User.findOneAndUpdate(
      {
        _id: user._id,
        passwordResetTokenHash: tokenHash,
        passwordResetExpiresAt: { $gt: new Date() },
        active: true
      },
      {
        $set: { passwordHash },
        $inc: { sessionVersion: 1 },
        $unset: { passwordResetTokenHash: 1, passwordResetExpiresAt: 1 }
      },
      { new: true, runValidators: true }
    );
    if (!updatedUser) throw new HttpError(400, "This password reset link is invalid or has expired.");
    return res.json({ message: "Password updated. Please sign in with your new password." });
  });

  router.post("/logout", (req, res) => {
    clearSessionCookie(res);
    return res.status(204).end();
  });

  router.get("/me", (req, res, next) => {
    if (!req.cookies[COOKIE_NAME]) return res.json({ user: null });
    return authenticate(req, res, next);
  }, (req, res) => res.json({ user: publicUser(req.user) }));

  return router;
}

module.exports = { createAuthRouter };
