const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const request = require("supertest");
const { MongoMemoryServer } = require("mongodb-memory-server");

process.env.JWT_SECRET = "test-session-secret-with-more-than-thirty-two-characters";
process.env.QR_SECRET = "test-qr-secret-that-is-different-and-over-thirty-two-characters";
process.env.APP_TIME_ZONE = "UTC";

const User = require("../src/models/User");
const Meal = require("../src/models/Meal");
const MealResponse = require("../src/models/MealResponse");
const { createApp } = require("../src/app");

test("authenticated meal workflow enforces roles, cutoffs, defaults, QR check-ins and reports", async () => {
  const mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  try {
    await Promise.all([User.init(), Meal.init(), MealResponse.init()]);
    const app = createApp();
    const health = await request(app).get("/api/health");
    assert.equal(health.status, 200);
    const page = await request(app).get("/");
    assert.equal(page.status, 200);
    assert.match(page.headers["content-security-policy"], /script-src 'self'/);
    const clientScript = await request(app).get("/client.js");
    assert.equal(clientScript.status, 200);
    assert.match(clientScript.text, /async function authenticateUser/);
    const anonymous = request.agent(app);
    assert.deepEqual((await anonymous.get("/api/auth/me")).body, { user: null });
    const admin = request.agent(app);
    const password = "valid-test-password-2026";
    await User.create({
      name: "Dining Admin",
      email: "admin@example.edu",
      role: "admin",
      passwordHash: await bcrypt.hash(password, 4)
    });

    const login = await admin.post("/api/auth/login").send({ email: "admin@example.edu", password });
    assert.equal(login.status, 200);
    assert.equal(login.body.user.role, "admin");

    const residentA = request.agent(app);
    const residentB = request.agent(app);
    const signupA = await residentA.post("/api/auth/register").send({
      name: "Resident One", email: "one@example.edu", password, role: "admin", residenceBlock: "A"
    });
    const signupB = await residentB.post("/api/auth/register").send({
      name: "Resident Two", email: "two@example.edu", password, residenceBlock: "B"
    });
    assert.equal(signupA.status, 201);
    assert.equal(signupA.body.user.role, "resident");
    assert.equal(signupB.status, 201);
    assert.equal((await residentA.get("/api/kitchen")).status, 403);

    const cookResponse = await admin.post("/api/admin/users").send({
      name: "Kitchen Cook", email: "cook@example.edu", password, role: "cook"
    });
    assert.equal(cookResponse.status, 201);
    const cook = request.agent(app);
    const cookLogin = await cook.post("/api/auth/login").send({ email: "cook@example.edu", password });
    assert.equal(cookLogin.status, 200);
    assert.equal((await cook.get("/api/admin/users")).status, 403);

    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const menuResponse = await admin.get("/api/meals").query({ date: tomorrow });
    assert.equal(menuResponse.status, 200);
    assert.equal(menuResponse.body.meals.length, 3);
    assert.equal(menuResponse.body.timeZone, "UTC");
    const mealByType = Object.fromEntries(menuResponse.body.meals.map(meal => [meal.type, meal]));
    const residentMenu = await residentA.get("/api/meals").query({ date: tomorrow });
    assert.equal(residentMenu.status, 200);
    assert.equal("expectedCount" in residentMenu.body.meals[0], false);
    const now = Date.now();
    const schedule = (cutoff, start, end) => ({
      date: tomorrow,
      menu: "Seasonal lunch",
      cutoffAt: new Date(now + cutoff).toISOString(),
      servingStartAt: new Date(now + start).toISOString(),
      servingEndAt: new Date(now + end).toISOString()
    });

    const lunchId = mealByType.lunch.id;
    const skip = await residentA.post(`/api/meals/${lunchId}/response`).send({ status: "skipping" });
    assert.equal(skip.status, 200);
    const changeChoice = await residentA.post(`/api/meals/${lunchId}/response`).send({ status: "eating" });
    assert.equal(changeChoice.status, 200);
    const skipAgain = await residentA.post(`/api/meals/${lunchId}/response`).send({ status: "skipping" });
    assert.equal(skipAgain.status, 200);
    const lunchUpdate = await admin.put("/api/admin/meals/lunch").send(schedule(-60000, -30000, 30 * 60000));
    assert.equal(lunchUpdate.status, 200);
    const kitchen = await cook.get("/api/kitchen").query({ date: tomorrow });
    assert.equal(kitchen.status, 200);
    assert.equal(kitchen.body.timeZone, "UTC");
    assert.equal(kitchen.body.meals.find(meal => meal.type === "lunch").expectedCount, 1);

    const pass = await residentB.get("/api/meals/lunch/pass").query({ date: tomorrow });
    assert.equal(pass.status, 200);
    assert.match(pass.body.qrDataUrl, /^data:image\/png;base64,/);
    const checkedIn = await cook.post("/api/check-ins/scan").send({ token: pass.body.token });
    assert.equal(checkedIn.status, 200);
    assert.equal(checkedIn.body.checkedIn, true);
    assert.equal(checkedIn.body.alreadyCheckedIn, false);
    const repeatCheckin = await cook.post("/api/check-ins/scan").send({ token: pass.body.token });
    assert.equal(repeatCheckin.status, 200);
    assert.equal(repeatCheckin.body.alreadyCheckedIn, true);
    assert.equal((await cook.post("/api/check-ins/scan").send({ token: "not-a-pass" })).status, 400);

    const breakfastUpdate = await admin.put("/api/admin/meals/breakfast").send({
      ...schedule(-60 * 60000, -50 * 60000, -30 * 60000),
      menu: "Breakfast"
    });
    assert.equal(breakfastUpdate.status, 200);
    const lockedChoice = await residentA.post(`/api/meals/${mealByType.breakfast.id}/response`).send({ status: "skipping" });
    assert.equal(lockedChoice.status, 409);

    const waste = await cook.post("/api/reports/waste").send({
      mealId: lunchId, wastedKg: 1.25, note: "Leftover salad"
    });
    assert.equal(waste.status, 201);
    const report = await admin.get("/api/reports").query({ from: tomorrow, to: tomorrow });
    assert.equal(report.status, 200);
    assert.equal(report.body.summary.wastedKg, 1.25);
    assert.equal(report.body.summary.noShows, 2);
    assert.equal(report.body.daily.length, 1);
    assert.equal((await admin.get("/api/reports").query({ to: "not-a-date" })).status, 400);

    const history = await residentB.get("/api/meals/history");
    assert.equal(history.body.history[0].attendance, "checked-in");
    assert.equal(await MealResponse.countDocuments({ userId: signupA.body.user.id, mealId: lunchId }), 1);
    assert.equal((await residentB.post("/api/auth/logout")).status, 204);
    assert.deepEqual((await residentB.get("/api/auth/me")).body, { user: null });
  } finally {
    await mongoose.disconnect();
    await mongo.stop();
  }
});
