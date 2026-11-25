const jwt = require("jsonwebtoken");
const config = require("../config");
const User = require("../models/User");
const { HttpError } = require("./http");

const COOKIE_NAME = "plate_session";

function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: 8 * 60 * 60 * 1000
  };
}

function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: "lax",
    path: "/"
  });
}

function setSessionCookie(res, user) {
  const token = jwt.sign(
    { sub: user.id, role: user.role },
    config.jwtSecret,
    { algorithm: "HS256", expiresIn: "8h", issuer: "plate-count", audience: "plate-count-session" }
  );
  res.cookie(COOKIE_NAME, token, sessionCookieOptions());
}

async function authenticate(req, res, next) {
  try {
    const token = req.cookies[COOKIE_NAME];
    if (!token) throw new HttpError(401, "Please sign in to continue.");

    const payload = jwt.verify(token, config.jwtSecret, {
      algorithms: ["HS256"],
      issuer: "plate-count",
      audience: "plate-count-session"
    });
    const user = await User.findById(payload.sub).select("name email role residenceBlock active");
    if (!user || !user.active) throw new HttpError(401, "Your session is no longer active.");
    req.user = user;
    return next();
  } catch (error) {
    if (error instanceof HttpError) return next(error);
    return next(new HttpError(401, "Your session is invalid or has expired."));
  }
}

module.exports = { COOKIE_NAME, authenticate, clearSessionCookie, setSessionCookie };
