const test = require("node:test");
const assert = require("node:assert/strict");
const {
  dateInTimeZone,
  defaultMealsForDate,
  expectedHeadcount,
  isDateKey,
  servingStatus,
  zonedDateTime
} = require("../src/domain/meals");

test("validates calendar date keys rather than only their shape", () => {
  assert.equal(isDateKey("2026-11-25"), true);
  assert.equal(isDateKey("2026-02-30"), false);
  assert.equal(isDateKey("25-11-2026"), false);
});

test("uses timezone-specific dates and cutoffs", () => {
  assert.equal(dateInTimeZone("Asia/Kolkata", new Date("2026-11-25T20:00:00.000Z")), "2026-11-26");
  assert.equal(zonedDateTime("2026-11-25", "10:30", "Asia/Kolkata").toISOString(), "2026-11-25T05:00:00.000Z");
  const [breakfast, lunch, dinner] = defaultMealsForDate("2026-11-25", "Asia/Kolkata");
  assert.deepEqual([breakfast.type, lunch.type, dinner.type], ["breakfast", "lunch", "dinner"]);
  assert.ok(lunch.cutoffAt < lunch.servingStartAt);
});

test("unanswered residents count as eating; skips reduce the headcount only once", () => {
  assert.equal(expectedHeadcount(128, 0), 128);
  assert.equal(expectedHeadcount(128, 3), 125);
  assert.equal(expectedHeadcount(2, 9), 0);
  assert.throws(() => expectedHeadcount(2, -1), TypeError);
});

test("derives meal serving status at the scheduled boundaries", () => {
  const meal = {
    servingStartAt: new Date("2026-11-25T12:30:00.000Z"),
    servingEndAt: new Date("2026-11-25T14:00:00.000Z"),
    servingCompletedAt: null
  };
  assert.equal(servingStatus(meal, new Date("2026-11-25T12:29:59.999Z")), "Coming up");
  assert.equal(servingStatus(meal, new Date("2026-11-25T12:30:00.000Z")), "Serving now");
  assert.equal(servingStatus(meal, new Date("2026-11-25T13:59:59.999Z")), "Serving now");
  assert.equal(servingStatus(meal, new Date("2026-11-25T14:00:00.000Z")), "Serving complete");
  meal.servingCompletedAt = new Date("2026-11-25T13:00:00.000Z");
  assert.equal(servingStatus(meal, new Date("2026-11-25T13:30:00.000Z")), "Serving complete");
});
