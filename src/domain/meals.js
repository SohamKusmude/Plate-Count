const MEAL_TYPES = Object.freeze(["breakfast", "lunch", "dinner"]);

const DEFAULT_SCHEDULE = Object.freeze({
  breakfast: { cutoff: "06:45", servingStart: "07:30", servingEnd: "09:00", menu: "Poha, fresh fruit & chai" },
  lunch: { cutoff: "10:30", servingStart: "12:30", servingEnd: "14:00", menu: "Dal tadka, jeera rice & salad" },
  dinner: { cutoff: "16:30", servingStart: "19:30", servingEnd: "21:00", menu: "Paneer curry, roti & seasonal veg" }
});

function isDateKey(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function dateInTimeZone(timeZone, date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function zonedDateTime(dateKey, time, timeZone) {
  if (!isDateKey(dateKey) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    throw new TypeError("Invalid date or time.");
  }
  const [year, month, day] = dateKey.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const targetUtc = Date.UTC(year, month - 1, day, hour, minute);
  let timestamp = targetUtc;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    }).formatToParts(new Date(timestamp));
    const values = Object.fromEntries(parts.map(part => [part.type, Number(part.value)]));
    const representedUtc = Date.UTC(values.year, values.month - 1, values.day, values.hour, values.minute);
    timestamp += targetUtc - representedUtc;
  }
  return new Date(timestamp);
}

function defaultMealsForDate(date, timeZone) {
  return MEAL_TYPES.map(type => {
    const schedule = DEFAULT_SCHEDULE[type];
    return {
      date,
      type,
      menu: schedule.menu,
      cutoffAt: zonedDateTime(date, schedule.cutoff, timeZone),
      servingStartAt: zonedDateTime(date, schedule.servingStart, timeZone),
      servingEndAt: zonedDateTime(date, schedule.servingEnd, timeZone)
    };
  });
}

function expectedHeadcount(residentCount, skippingCount) {
  if (!Number.isInteger(residentCount) || residentCount < 0 ||
      !Number.isInteger(skippingCount) || skippingCount < 0) {
    throw new TypeError("Resident and skipping counts must be non-negative integers.");
  }
  return Math.max(0, residentCount - Math.min(residentCount, skippingCount));
}

function servingStatus(meal, now = Date.now()) {
  if (meal.servingCompletedAt || now >= new Date(meal.servingEndAt).getTime()) return "Serving complete";
  if (now >= new Date(meal.servingStartAt).getTime()) return "Serving now";
  return "Coming up";
}

module.exports = {
  DEFAULT_SCHEDULE,
  MEAL_TYPES,
  dateInTimeZone,
  defaultMealsForDate,
  expectedHeadcount,
  isDateKey,
  servingStatus,
  zonedDateTime
};
