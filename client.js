(function () {
  "use strict";

  const $ = (selector, root) => (root || document).querySelector(selector);
  const $$ = (selector, root) => Array.from((root || document).querySelectorAll(selector));
  const icons = {
    grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zm4 4h3v3h-3zm0-4h3m-7 7h3"/>',
    kitchen: '<path d="M3 10h18M5 10l1 10h12l1-10M8 10V6a4 4 0 0 1 8 0v4M9 14v2m6-2v2"/>',
    manage: '<path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"/><path d="m19.4 15 1.5 1.2-1.4 2.4-1.8-.7a8 8 0 0 1-1.5.9l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.5-.9l-1.8.7-1.4-2.4 1.5-1.2a8 8 0 0 1 0-1.8l-1.5-1.2 1.4-2.4 1.8.7a8 8 0 0 1 1.5-.9l.3-1.8h2.8l.3 1.8a8 8 0 0 1 1.5.9l1.8-.7 1.4 2.4-1.5 1.2a8 8 0 0 1 0 1.8Z"/>',
    chart: '<path d="M4 19V5m0 14h17"/><path d="M8 15v-4m4 4V7m4 8v-6m4 6V4"/>',
    leaf: '<path d="M20 4c-9 0-15 3-15 10a6 6 0 0 0 6 6c7 0 9-7 9-16Z"/><path d="M5 19c3-4 6-7 11-10"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M20 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
    arrow: '<path d="M5 12h14m-7-7 7 7-7 7"/>',
    plus: '<path d="M12 5v14m-7-7h14"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5m-5 5V3"/>',
    spark: '<path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z"/>'
  };
  const icon = name => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + icons[name] + '</svg>';
  const routes = {
    resident: [["today", "Today's meals", "grid"], ["history", "My history", "clock"], ["checkin", "QR check-in", "qr"]],
    cook: [["kitchen", "Kitchen dashboard", "kitchen"], ["checkin", "QR check-in", "qr"]],
    admin: [["manage", "Manage", "manage"], ["reports", "Reports", "chart"], ["kitchen", "Kitchen dashboard", "kitchen"], ["checkin", "QR check-in", "qr"]]
  };
  const routeNames = { today: "Today's meals", history: "My history", checkin: "QR check-in", kitchen: "Kitchen dashboard", manage: "Manage", reports: "Reports", about: "About Plate Count" };
  const mealsMeta = {
    breakfast: { label: "Breakfast", icon: "🥣", color: "" },
    lunch: { label: "Lunch", icon: "🍛", color: "lunch" },
    dinner: { label: "Dinner", icon: "🥘", color: "dinner" }
  };
  const state = {
    user: null,
    route: "today",
    theme: localStorage.getItem("plate-theme") || "dark",
    date: null,
    timeZone: "Asia/Kolkata",
    meals: [],
    history: [],
    kitchen: null,
    pass: null,
    passError: "",
    passType: "",
    users: [],
    userCounts: { residents: 0, kitchenTeam: 0 },
    report: null,
    manageMealType: "lunch",
    authMode: "login",
    cameraStream: null,
    scannerFrame: null,
    scannerBusy: false
  };

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, character => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[character]);
  }

  function showToast(message) {
    const toast = $("#toast");
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(showToast.timeout);
    showToast.timeout = setTimeout(() => toast.classList.remove("show"), 3200);
  }

  async function api(path, options) {
    const settings = options || {};
    const headers = new Headers(settings.headers || {});
    if (settings.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    const response = await fetch(path, {
      ...settings,
      headers,
      credentials: "same-origin"
    });
    if (response.status === 204) return null;
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401 && state.user) showLogin();
      throw new Error(result.error || "The request could not be completed.");
    }
    return result;
  }

  function userLabel() {
    return state.user ? escapeHtml(state.user.name.split(/\s+/)[0]) : "there";
  }

  function initials(name) {
    return String(name || "").split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("").toUpperCase();
  }

  function formatTime(value) {
    if (!value) return "—";
    return new Intl.DateTimeFormat(undefined, { timeZone: state.timeZone, hour: "numeric", minute: "2-digit" }).format(new Date(value));
  }

  function formatDate(value) {
    if (!value) return "Today";
    const date = new Date(value + "T12:00:00Z");
    return new Intl.DateTimeFormat(undefined, { timeZone: "UTC", month: "short", day: "numeric" }).format(date);
  }

  function formatDateTime(value) {
    if (!value) return "—";
    return new Intl.DateTimeFormat(undefined, { timeZone: state.timeZone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
  }

  function toDateTimeInput(value) {
    if (!value) return "";
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: state.timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    }).formatToParts(new Date(value));
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return values.year + "-" + values.month + "-" + values.day + "T" + values.hour + ":" + values.minute;
  }

  function dateTimeInputToIso(value) {
    const [date, time] = value.split("T");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) throw new Error("Enter a valid date and time.");
    const [year, month, day] = date.split("-").map(Number);
    const [hour, minute] = time.split(":").map(Number);
    const targetUtc = Date.UTC(year, month - 1, day, hour, minute);
    let timestamp = targetUtc;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: state.timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23"
      }).formatToParts(new Date(timestamp));
      const values = Object.fromEntries(parts.map(part => [part.type, Number(part.value)]));
      timestamp += targetUtc - Date.UTC(values.year, values.month - 1, values.day, values.hour, values.minute);
    }
    return new Date(timestamp).toISOString();
  }

  function isLocked(meal) {
    return !meal.cutoffAt || Date.now() >= new Date(meal.cutoffAt).getTime();
  }

  function countdown(meal) {
    const seconds = Math.max(0, Math.floor((new Date(meal.cutoffAt).getTime() - Date.now()) / 1000));
    if (seconds <= 0) return "Locked";
    const hours = String(Math.floor(seconds / 3600)).padStart(2, "0");
    const minutes = String(Math.floor(seconds % 3600 / 60)).padStart(2, "0");
    const remaining = String(seconds % 60).padStart(2, "0");
    return hours + ":" + minutes + ":" + remaining;
  }

  function mealCard(meal) {
    const meta = mealsMeta[meal.type] || mealsMeta.lunch;
    const locked = isLocked(meal);
    const currentStatus = meal.myResponse;
    const attendance = state.user.role !== "resident" && Number.isInteger(meal.expectedCount)
      ? '<span>' + icon("users") + '<b>' + meal.expectedCount + '</b> expected</span>'
      : "";
    return '<article class="meal-card"><div class="meal-photo ' + meta.color + '"><span class="meal-emoji">' + meta.icon + '</span></div>' +
      '<div><h3 class="meal-name">' + escapeHtml(meta.label) + '</h3><p class="meal-description">' + escapeHtml(meal.menu) + '</p><div class="meal-meta"><span>' + icon("clock") + formatTime(meal.servingStartAt) + ' – ' + formatTime(meal.servingEndAt) + '</span>' + attendance + '</div></div>' +
      '<div class="meal-side"><div class="meal-cutoff">' + (locked ? "Choices locked" : "Closes in <strong>" + countdown(meal) + "</strong>") + '</div><div class="choice-row"><button class="choice-button ' + (currentStatus === "eating" ? "selected-eat" : "") + '" data-choice="eating" data-meal="' + meal.id + '"' + (locked ? " disabled" : "") + '>✓ Eating</button><button class="choice-button ' + (currentStatus === "skipping" ? "selected-skip" : "") + '" data-choice="skipping" data-meal="' + meal.id + '"' + (locked ? " disabled" : "") + '>Skipping</button></div></div></article>';
  }

  function todayMarkup() {
    const decisions = state.meals.filter(meal => meal.myResponse).length;
    const checkins = state.history.filter(item => item.checkedInAt).length;
    const noShows = state.history.filter(item => item.attendance === "no-show").length;
    const upcoming = state.meals.filter(meal => !isLocked(meal));
    const recent = state.history.slice(0, 3).map(item =>
      '<div class="activity-item"><span class="activity-icon">' + icon(item.checkedInAt ? "check" : item.status === "skipping" ? "leaf" : "clock") + '</span><div><p><strong>' +
        escapeHtml(mealsMeta[item.mealType]?.label || item.mealType) + ' · ' + escapeHtml(item.status) + '</strong><br>' +
        escapeHtml(item.menu) + '</p><time>' + formatDate(item.date) + (item.checkedInAt ? " · " + formatTime(item.checkedInAt) : "") + '</time></div></div>'
    ).join("");
    const earliestCutoff = upcoming.sort((a, b) => new Date(a.cutoffAt) - new Date(b.cutoffAt))[0];
    return '<div class="page-heading"><div><div class="eyebrow"><span class="pulse"></span> TODAY · MAPLE HALL</div><h1>Good afternoon, ' + userLabel() + ' <span aria-hidden="true">✦</span></h1><p class="subtitle">A quick tap helps the kitchen make just enough. What’s on your plate today?</p></div><button class="button quiet" data-go="history">' + icon("calendar") + ' View your history</button></div>' +
      '<div class="stat-grid"><article class="stat-card"><div class="stat-top"><span>Meals today</span><span class="stat-icon">' + icon("calendar") + '</span></div><div class="stat-value">' + state.meals.length + '</div><div class="stat-note">On the menu for your hall</div></article>' +
      '<article class="stat-card"><div class="stat-top"><span>Your decisions</span><span class="stat-icon">' + icon("leaf") + '</span></div><div class="stat-value">' + decisions + '<span style="font:500 11px DM Sans;color:var(--muted)"> / ' + state.meals.length + '</span></div><div class="stat-note">No response counts as eating</div></article>' +
      '<article class="stat-card"><div class="stat-top"><span>Check-ins</span><span class="stat-icon">' + icon("check") + '</span></div><div class="stat-value">' + checkins + '</div><div class="stat-note">Recorded in your recent history</div></article>' +
      '<article class="stat-card"><div class="stat-top"><span>No-shows</span><span class="stat-icon">' + icon("spark") + '</span></div><div class="stat-value">' + noShows + '</div><div class="stat-note">Past meals you marked eating</div></article></div>' +
      '<div class="dashboard-grid"><div class="left-column"><section class="deadline-banner"><div class="deadline-copy">' + icon("clock") + '<span><strong>' + (earliestCutoff ? "Next cutoff · " + escapeHtml(mealsMeta[earliestCutoff.type].label) : "All choices are locked for today.") + '</strong> No response counts as eating.</span></div><span class="countdown">' + (earliestCutoff ? countdown(earliestCutoff) : "CLOSED") + '</span></section>' +
      '<section class="panel"><div class="panel-head"><div><h2 class="panel-title">Today’s menu</h2><p class="panel-subtitle">Choose what you’ll be eating. Your kitchen sees the live count.</p></div><span class="status-pill">Menu live</span></div><div class="meal-list">' + state.meals.map(mealCard).join("") + '</div><div class="progress-card"><div class="progress-top"><span>Today’s meal plan</span><span>' + decisions + ' of ' + state.meals.length + ' decisions made</span></div><div class="progress-track"><div class="progress-fill" style="width:' + Math.max(8, state.meals.length ? decisions / state.meals.length * 100 : 0) + '%"></div></div><p class="progress-caption">Your response helps us prepare the right amount and reduce leftovers.</p></div></section></div>' +
      '<aside class="right-column"><section class="panel"><div class="panel-head"><div><h2 class="panel-title">Your recent activity</h2><p class="panel-subtitle">Recorded meal choices and check-ins.</p></div><button class="icon-button" data-go="history" aria-label="View history">' + icon("arrow") + '</button></div><div class="activity-list">' + (recent || '<p class="subtitle">Your recent choices and check-ins will appear here.</p>') + '</div><div class="impact-mini"><span>YOUR CHECK-INS</span><strong>' + checkins + ' <span style="font-size:14px">🌱</span></strong><span>Every meal you show up for helps us plan better.</span></div></section><section class="panel"><div class="panel-head"><div><h2 class="panel-title">A note from the kitchen</h2><p class="panel-subtitle">Your dining hall</p></div></div><p style="margin:0;color:var(--muted);font-size:10px;line-height:1.75">A thoughtful headcount helps the team cook fresh food for the people who are here. Thanks for being part of it.</p></section></aside></div>';
  }

  function historyMarkup() {
    const rows = state.history.map(item => {
      const attendance = item.attendance === "checked-in" ? ["Checked in", ""] :
        item.attendance === "no-show" ? ["No-show", "red"] : ["Pending", "orange"];
      const status = item.status === "skipping" ? ["Skipping", "orange"] : ["Eating", ""];
      return '<tr><td class="muted">' + escapeHtml(formatDate(item.date)) + '</td><td><strong>' + escapeHtml(mealsMeta[item.mealType]?.label || item.mealType) + '</strong></td><td class="muted">' + escapeHtml(item.menu) + '</td><td><span class="status-pill ' + status[1] + '">' + status[0] + '</span></td><td><span class="status-pill ' + attendance[1] + '">' + attendance[0] + '</span></td></tr>';
    }).join("");
    const checkins = state.history.filter(item => item.checkedInAt).length;
    const noShows = state.history.filter(item => item.attendance === "no-show").length;
    const skips = state.history.filter(item => item.status === "skipping").length;
    return '<div class="page-heading"><div><div class="eyebrow">YOUR MEALS, YOUR IMPACT</div><h1>My history</h1><p class="subtitle">Your recorded choices and counter check-ins.</p></div><button class="button quiet" data-go="today">← Back to today</button></div><section class="panel"><div class="panel-head"><div><h2 class="panel-title">Recent meals</h2><p class="panel-subtitle">Your latest recorded meal activity</p></div></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Date</th><th>Meal</th><th>Menu</th><th>Your choice</th><th>Check-in</th></tr></thead><tbody>' + (rows || '<tr><td colspan="5" class="muted">No meal responses yet.</td></tr>') + '</tbody></table></div></section><div class="insight-row"><div class="insight"><span>CHECK-INS</span><strong>' + checkins + '</strong></div><div class="insight"><span>NO-SHOWS</span><strong>' + noShows + '</strong></div><div class="insight"><span>MEALS SKIPPED</span><strong>' + skips + '</strong></div></div>';
  }

  function residentCheckinMarkup() {
    const options = state.meals.map(meal => '<option value="' + meal.type + '"' + (state.passType === meal.type ? " selected" : "") + '>' + escapeHtml(mealsMeta[meal.type].label) + ' · ' + formatTime(meal.servingStartAt) + '</option>').join("");
    const passBody = state.pass
      ? '<div class="qr-placeholder"><img src="' + state.pass.qrDataUrl + '" alt="Secure QR meal pass" width="170" height="170"></div><p class="qr-label">PASS · ' + escapeHtml(state.pass.meal.type.toUpperCase()) + ' · ' + escapeHtml(state.user.email) + '</p>'
      : '<div class="checkin-status"><span class="status-icon">' + icon("clock") + '</span><div><strong>Pass unavailable</strong><span>' + escapeHtml(state.passError || "There is no available meal pass right now.") + '</span></div></div>';
    const checkedIn = Boolean(state.pass && state.pass.checkedInAt);
    return '<div class="page-heading"><div><div class="eyebrow">QUICK · CONTACTLESS · SECURE</div><h1>Check in at the counter</h1><p class="subtitle">Show your time-limited meal pass when you pick up your plate.</p></div><span class="status-pill">Resident pass</span></div><section class="panel"><div class="panel-head"><div><h2 class="panel-title">Your meal pass</h2><p class="panel-subtitle">This signed pass is valid only for your account and its serving window.</p></div><select id="passMealType" class="tiny-select" aria-label="Choose a meal">' + options + '</select></div><div class="qr-layout"><div>' + passBody + '</div><div><div class="scan-info"><div class="scan-step"><span class="step-number">01</span><div><strong>Open your pass</strong>Keep this screen ready at the counter.</div></div><div class="scan-step"><span class="step-number">02</span><div><strong>Let the cook scan</strong>The kitchen scans this code to check you in.</div></div><div class="scan-step"><span class="step-number">03</span><div><strong>Enjoy your meal</strong>Your check-in improves tomorrow’s prep.</div></div></div><div class="checkin-status ' + (checkedIn ? "checked" : "") + '"><span class="status-icon">' + icon(checkedIn ? "check" : "clock") + '</span><div><strong>' + (checkedIn ? "You’re checked in!" : "Ready for the counter") + '</strong><span>' + (checkedIn ? formatDateTime(state.pass.checkedInAt) : "Your pass is protected and meal-specific.") + '</span></div></div></div></div></section>';
  }

  function cookCheckinMarkup() {
    return '<div class="page-heading"><div><div class="eyebrow">KITCHEN · COUNTER SCAN</div><h1>Scan a meal pass</h1><p class="subtitle">Use the camera scanner or paste a resident’s signed pass token.</p></div><span class="status-pill">Cook access</span></div><div class="two-col"><section class="panel"><div class="panel-head"><div><h2 class="panel-title">Camera scanner</h2><p class="panel-subtitle">Camera access requires HTTPS or localhost.</p></div></div><div class="camera-preview" id="cameraPreview" hidden><video id="cameraVideo" muted playsinline></video></div><button class="button primary" id="startCamera">' + icon("qr") + ' Start camera scanner</button><div class="checkin-status" id="scanStatus"><span class="status-icon">' + icon("clock") + '</span><div><strong>Scanner ready</strong><span>Check the meal pass during its serving window.</span></div></div></section><section class="panel"><div class="panel-head"><div><h2 class="panel-title">Manual pass entry</h2><p class="panel-subtitle">Paste the QR token if camera scanning is unavailable.</p></div></div><form id="manualScanForm"><div class="field"><label for="scanToken">Signed meal pass</label><textarea id="scanToken" required maxlength="4096" placeholder="Paste the code contents here"></textarea></div><button class="button primary" type="submit" style="width:100%;margin-top:12px">Verify and check in</button></form></section></div>';
  }

  function kitchenMarkup() {
    const dashboard = state.kitchen;
    if (!dashboard) return '<div class="panel">Loading kitchen counts…</div>';
    const mealCards = dashboard.meals.map(meal => {
      const meta = mealsMeta[meal.type];
      const status = Date.now() < new Date(meal.servingStartAt) ? "Coming up" : Date.now() < new Date(meal.servingEndAt) ? "Serving now" : "Served";
      const badge = status === "Coming up" ? "orange" : "";
      return '<article class="meal-count-card"><div class="meal-count-head"><span>' + meta.icon + ' &nbsp;' + meta.label + '</span><span class="status-pill ' + badge + '">' + status + '</span></div><strong>' + meal.expectedCount + ' <small>/ ' + dashboard.residentCount + '</small></strong><div class="count-note"><span>' + meal.responseCount + ' responded</span><span>' + meal.checkedInCount + ' checked in' + (meal.noShowCount == null ? "" : " · " + meal.noShowCount + " no-shows") + '</span></div></article>';
    }).join("");
    const lunch = dashboard.meals.find(meal => meal.type === "lunch") || dashboard.meals[0];
    const recentCheckins = (dashboard.recentCheckIns || []).map(item =>
      '<div class="activity-item"><span class="activity-icon">' + icon("check") + '</span><div><p><strong>' + escapeHtml(item.name) + '</strong> checked in</p><time>' + escapeHtml(formatTime(item.checkedInAt)) + (item.residenceBlock ? " · " + escapeHtml(item.residenceBlock) : "") + '</time></div></div>'
    ).join("");
    const prepRows = lunch ? ['Menu', 'Kitchen prep'].map(label =>
      '<tr><td><strong>' + label + '</strong></td><td class="muted">' + lunch.expectedCount + ' portions</td><td>' + (lunch.expectedCount + Math.ceil(lunch.expectedCount * .04)) + ' portions</td><td><span class="status-pill">On track</span></td></tr>'
    ).join("") : "";
    return '<div class="page-heading"><div><div class="eyebrow"><span class="pulse"></span> KITCHEN HEADCOUNT · ' + escapeHtml(formatDate(dashboard.date)) + '</div><h1>Good afternoon, chef</h1><p class="subtitle">Expected covers include residents with no response.</p></div><button class="button" id="refreshCounts">' + icon("clock") + ' Refresh counts</button></div><div class="kitchen-hero"><section class="kitchen-total"><div class="tagline">' + icon("users") + ' EXPECTED TODAY · ALL MEALS</div><h2>' + dashboard.totalExpected + '</h2><p>meal covers expected from ' + dashboard.residentCount + ' active residents</p></section><section class="kitchen-target"><div><div class="target-label">Response rate today</div><div class="target-value">' + dashboard.responseRate + '<small>% across all meals</small></div></div><div class="target-bar"><div class="progress-track"><div class="progress-fill" style="width:' + dashboard.responseRate + '%"></div></div><p class="progress-caption">No response defaults to eating.</p></div></section></div><div class="meal-count-grid">' + mealCards + '</div><div class="two-col"><section class="panel"><div class="panel-head"><div><h2 class="panel-title">Prep estimates</h2><p class="panel-subtitle">' + (lunch ? escapeHtml(lunch.menu) : "Today’s meal preparation") + '</p></div><button class="button" data-action="log-waste">' + icon("plus") + ' Log waste</button></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Prep item</th><th>Expected</th><th>Target (+4%)</th><th>Status</th></tr></thead><tbody>' + prepRows + '</tbody></table></div></section><section class="panel"><div class="panel-head"><div><h2 class="panel-title">Recent check-ins</h2><p class="panel-subtitle">Scanned at the meal counter</p></div><button class="button quiet" data-go="checkin">Scan pass →</button></div><div class="activity-list">' + (recentCheckins || '<p class="subtitle">No check-ins recorded yet today.</p>') + '</div></section></div>';
  }

  function adminMenuMarkup() {
    const meal = state.meals.find(item => item.type === state.manageMealType) || state.meals[0];
    if (!meal) return '<section class="panel">No meals are available for this date.</section>';
    const options = state.meals.map(item => '<option value="' + item.type + '"' + (item.type === meal.type ? " selected" : "") + '>' + mealsMeta[item.type].label + '</option>').join("");
    return '<section class="panel"><div class="panel-head"><div><h2 class="panel-title">Edit today’s menu</h2><p class="panel-subtitle">Changes are visible to residents immediately. Cutoffs lock when reached.</p></div></div><form id="menuForm"><div class="form-grid"><div class="field"><label for="manageMealType">Meal</label><select id="manageMealType">' + options + '</select></div><div class="field"><label for="menuName">Menu description</label><input id="menuName" maxlength="500" required value="' + escapeHtml(meal.menu) + '"></div><div class="field"><label for="cutoff">Choice cutoff</label><input type="datetime-local" id="cutoff" required value="' + toDateTimeInput(meal.cutoffAt) + '"></div><div class="field"><label for="serveStart">Serving starts</label><input type="datetime-local" id="serveStart" required value="' + toDateTimeInput(meal.servingStartAt) + '"></div><div class="field"><label for="serveEnd">Serving ends</label><input type="datetime-local" id="serveEnd" required value="' + toDateTimeInput(meal.servingEndAt) + '"></div></div><div class="form-actions"><button class="button primary" type="submit">Save menu changes</button></div></form></section>';
  }

  function manageMarkup() {
    const users = state.users.map(user =>
      '<div class="activity-item"><span class="avatar" style="width:29px;height:29px">' + escapeHtml(initials(user.name)) + '</span><div><p><strong>' + escapeHtml(user.name) + '</strong><br>' + escapeHtml(user.role) + (user.residenceBlock ? " · " + escapeHtml(user.residenceBlock) : "") + '</p></div><span class="status-pill">Active</span></div>'
    ).join("");
    return '<div class="page-heading"><div><div class="eyebrow">ADMIN WORKSPACE</div><h1>Manage your dining hall</h1><p class="subtitle">Keep menus, meal times and your community up to date.</p></div><span class="status-pill">Maple Hall · North</span></div><div class="management-grid"><div>' + adminMenuMarkup() + '</div><section class="panel"><div class="panel-head"><div><h2 class="panel-title">Your community</h2><p class="panel-subtitle">Residents and kitchen team members</p></div><button class="button" data-action="invite">' + icon("plus") + ' Add account</button></div><div class="stat-grid" style="grid-template-columns:1fr 1fr;margin:0 0 14px;gap:9px"><article class="stat-card" style="min-height:auto;padding:13px"><div class="stat-top">Residents</div><div class="stat-value">' + state.userCounts.residents + '</div><div class="stat-note">Active accounts</div></article><article class="stat-card" style="min-height:auto;padding:13px"><div class="stat-top">Kitchen team</div><div class="stat-value">' + state.userCounts.kitchenTeam + '</div><div class="stat-note">Cooks and admins</div></article></div><div class="activity-list">' + (users || '<p class="subtitle">No users have been added.</p>') + '</div></section></div><dialog class="app-dialog" id="inviteDialog"><form id="inviteForm"><div class="dialog-heading"><div><h2>Add a community account</h2><p>Create a resident, cook or administrator login.</p></div><button class="icon-button" type="button" data-close-dialog aria-label="Close dialog">×</button></div><div class="field"><label for="inviteName">Full name</label><input id="inviteName" required minlength="2" maxlength="100"></div><div class="field"><label for="inviteEmail">Email address</label><input id="inviteEmail" type="email" required maxlength="254"></div><div class="field"><label for="inviteRole">Role</label><select id="inviteRole"><option value="resident">Resident</option><option value="cook">Cook</option><option value="admin">Admin</option></select></div><div class="field"><label for="inviteBlock">Residence block (residents)</label><input id="inviteBlock" maxlength="80"></div><div class="field"><label for="invitePassword">Temporary password</label><input id="invitePassword" type="password" required minlength="10" maxlength="72" autocomplete="new-password"></div><div class="dialog-actions"><button class="button quiet" type="button" data-close-dialog>Cancel</button><button class="button primary" type="submit">Create account</button></div></form></dialog>';
  }

  function reportsMarkup() {
    const report = state.report;
    if (!report) return '<section class="panel">Loading reports…</section>';
    const daily = report.daily || [];
    const maxWaste = Math.max(1, ...daily.map(day => day.wastedKg));
    const bars = daily.slice(-7).map(day => {
      const date = new Date(day.date + "T12:00:00");
      const label = new Intl.DateTimeFormat(undefined, { weekday: "narrow" }).format(date);
      return '<div class="bar-day"><div class="bar-pair"><span class="bar" style="height:' + Math.max(4, day.attendanceRate) + '%" title="Attendance ' + day.attendanceRate + '%"></span><span class="bar waste" style="height:' + Math.max(4, day.wastedKg / maxWaste * 100) + '%" title="Waste ' + day.wastedKg + ' kg"></span></div><span>' + escapeHtml(label) + '</span></div>';
    }).join("");
    const wasteRows = report.wasteLogs.map(item =>
      '<tr><td class="muted">' + escapeHtml(formatDate(item.date)) + '</td><td>' + escapeHtml(mealsMeta[item.mealType]?.label || item.mealType) + '</td><td><strong>' + item.wastedKg + ' kg</strong></td><td class="muted">' + escapeHtml(item.note || "—") + '</td></tr>'
    ).join("");
    const summary = report.summary;
    const averageDaily = daily.length ? (daily.reduce((total, day) => total + day.wastedKg, 0) / daily.length).toFixed(1) : "0.0";
    return '<div class="page-heading"><div><div class="eyebrow">SMALL CHOICES, BIG IMPACT</div><h1>Less waste, more good</h1><p class="subtitle">Attendance and kitchen waste from recorded meal activity.</p></div><button class="button" data-action="export">' + icon("download") + ' Download report</button></div><div class="stat-grid"><article class="stat-card"><div class="stat-top">Food waste logged <span class="stat-icon">' + icon("leaf") + '</span></div><div class="stat-value">' + summary.wastedKg + '<span style="font:500 11px DM Sans;color:var(--muted)"> kg</span></div><div class="stat-note">In the selected reporting period</div></article><article class="stat-card"><div class="stat-top">Expected covers <span class="stat-icon">' + icon("calendar") + '</span></div><div class="stat-value">' + summary.expected + '</div><div class="stat-note">No response is counted as eating</div></article><article class="stat-card"><div class="stat-top">Resident attendance <span class="stat-icon">' + icon("users") + '</span></div><div class="stat-value">' + summary.attendanceRate + '%</div><div class="stat-note">' + summary.checkedIn + ' recorded check-ins</div></article><article class="stat-card"><div class="stat-top">No-shows <span class="stat-icon">' + icon("spark") + '</span></div><div class="stat-value">' + summary.noShows + '</div><div class="stat-note">Expected but not checked in after service</div></article></div><section class="panel chart-panel"><div class="panel-head"><div><h2 class="panel-title">Attendance & food waste</h2><p class="panel-subtitle">' + escapeHtml(formatDate(report.from)) + ' – ' + escapeHtml(formatDate(report.to)) + '</p></div><div class="legend"><span><i></i> Attendance</span><span><i></i> Waste</span></div></div><div class="chart-bars">' + (bars || '<p class="subtitle">No report data for this period.</p>') + '</div><div class="insight-row"><div class="insight"><span>ATTENDANCE</span><strong>' + summary.attendanceRate + '%</strong></div><div class="insight"><span>NO-SHOWS</span><strong>' + summary.noShows + '</strong></div><div class="insight"><span>AVG WASTE / DAY</span><strong>' + averageDaily + ' kg</strong></div></div></section><section class="panel section-spacer"><div class="panel-head"><div><h2 class="panel-title">Waste log</h2><p class="panel-subtitle">Kitchen-recorded leftovers</p></div><button class="button" data-action="log-waste">' + icon("plus") + ' Log waste</button></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Date</th><th>Meal</th><th>Waste</th><th>Note</th></tr></thead><tbody>' + (wasteRows || '<tr><td colspan="4" class="muted">No waste logs for this period.</td></tr>') + '</tbody></table></div></section>';
  }

  function aboutMarkup() {
    return '<div class="about-hero"><div class="about-hero-copy"><div class="eyebrow"><span class="pulse"></span> A better way to gather</div><h1>Good food deserves <span>to be enjoyed,</span> not wasted.</h1><p>Plate Count brings residents and kitchen teams together around one simple idea: when we know who’s coming, we can make just enough for everyone.</p></div></div><div class="about-grid"><article class="about-card"><span class="about-number">01 / THE CHALLENGE</span><h3>Too much food, too little notice</h3><p>Campus kitchens cook for hundreds every day. Without a headcount, good food gets left behind and careful planning gets harder.</p></article><article class="about-card"><span class="about-number">02 / THE IDEA</span><h3>A small tap changes the plan</h3><p>Residents tell the kitchen whether they’re coming. Cooks get a live headcount, a clearer prep list, and fewer surprise leftovers.</p></article><article class="about-card"><span class="about-number">03 / THE IMPACT</span><h3>Better for people and planet</h3><p>Less over-preparation means less food waste, smarter spending and a more thoughtful dining community, meal after meal.</p></article></div><div class="about-values"><blockquote class="about-quote"><p>“The best meal plan isn’t about making less. It’s about making the right amount, for the people who are actually there.”</p><span>OUR KITCHEN, OUR COMMUNITY</span></blockquote><section class="about-principles"><div class="principle">' + icon("check") + '<span>Simple for residents: one tap, done.</span></div><div class="principle">' + icon("check") + '<span>Useful for cooks: clear counts before prep.</span></div><div class="principle">' + icon("check") + '<span>Fair by default: no response means eating.</span></div><div class="principle">' + icon("check") + '<span>Reliable: choices lock when the kitchen needs to start.</span></div></section></div><p style="margin:22px 0 0;color:var(--muted);font-size:10px">Plate Count is a community-first food planning app for hostels and campus dining teams.</p>';
  }

  const pageRenderers = {
    today: todayMarkup,
    history: historyMarkup,
    checkin: () => state.user.role === "resident" ? residentCheckinMarkup() : cookCheckinMarkup(),
    kitchen: kitchenMarkup,
    manage: manageMarkup,
    reports: reportsMarkup,
    about: aboutMarkup
  };

  function renderNav() {
    const items = (routes[state.user.role] || routes.resident).concat([["about", "About Plate Count", "leaf"]]);
    const links = items.map(([id, label, glyph]) =>
      '<a href="#" class="nav-link ' + (state.route === id ? "active" : "") + '" data-route="' + id + '">' +
      icon(glyph) + '<span>' + label + '</span></a>'
    );
    $("#sideNav").innerHTML = links.join("");
    $("#mobileNav").innerHTML = items.slice(0, 4).map(([id, label, glyph]) =>
      '<a href="#" class="nav-link ' + (state.route === id ? "active" : "") + '" data-route="' + id + '">' +
      icon(glyph) + '<span>' + label.replace(" dashboard", "").replace(" Plate Count", "") + '</span></a>'
    ).join("");
  }

  function render() {
    if (!state.user) return;
    const allowed = routes[state.user.role] || routes.resident;
    if (!allowed.some(item => item[0] === state.route) && state.route !== "about") state.route = allowed[0][0];
    Object.keys(pageRenderers).forEach(route => {
      const section = $("#page-" + route);
      section.classList.toggle("active", route === state.route);
      if (route === state.route) section.innerHTML = pageRenderers[route]();
    });
    renderNav();
    $("#crumb").textContent = routeNames[state.route];
    $("#roleBadge").textContent = state.user.role;
    $("#userRole").textContent = state.user.role;
    $("#userName").textContent = state.user.name;
    $("#avatar").textContent = initials(state.user.name);
    $("#dateText").textContent = new Intl.DateTimeFormat(undefined, { timeZone: state.timeZone, weekday: "short", month: "short", day: "numeric" }).format(new Date());
  }

  function showApp() {
    $("#loginScreen").classList.remove("active");
    $("#appShell").style.display = "";
    $("#mobileNav").style.display = "";
  }

  function showLogin() {
    stopCamera();
    state.user = null;
    state.route = "today";
    if (state.authMode !== "login") toggleAuthMode();
    $("#loginForm").reset();
    $("#appShell").style.display = "none";
    $("#mobileNav").style.display = "none";
    $("#loginScreen").classList.add("active");
  }

  async function loadRoute(route, scroll) {
    if (!state.user) return;
    stopCamera();
    state.route = route;
    state.pass = null;
    state.passError = "";
    try {
      if (route === "today") {
        const [menu, history] = await Promise.all([api("/api/meals"), api("/api/meals/history")]);
        state.date = menu.date;
        state.timeZone = menu.timeZone;
        state.meals = menu.meals;
        state.history = history.history;
      } else if (route === "history") {
        const history = await api("/api/meals/history");
        state.history = history.history;
      } else if (route === "checkin") {
        const menu = await api("/api/meals");
        state.date = menu.date;
        state.timeZone = menu.timeZone;
        state.meals = menu.meals;
        if (state.user.role === "resident") {
          const now = Date.now();
          const candidates = menu.meals.filter(meal => new Date(meal.servingEndAt).getTime() > now && meal.myResponse !== "skipping");
          const selected = candidates.find(meal => now >= new Date(meal.servingStartAt).getTime()) || candidates[0];
          state.passType = selected ? selected.type : menu.meals[0]?.type || "";
          if (selected) {
            try {
              state.pass = await api("/api/meals/" + encodeURIComponent(selected.type) + "/pass?date=" + encodeURIComponent(menu.date));
            } catch (error) {
              state.passError = error.message;
            }
          } else {
            state.passError = "No upcoming meal is available for check-in.";
          }
        }
      } else if (route === "kitchen") {
        state.kitchen = await api("/api/kitchen");
        state.date = state.kitchen.date;
        state.timeZone = state.kitchen.timeZone;
      } else if (route === "manage") {
        const [menu, users] = await Promise.all([
          api("/api/meals"),
          api("/api/admin/users")
        ]);
        state.date = menu.date;
        state.timeZone = menu.timeZone;
        state.meals = menu.meals;
        state.users = users.users;
        state.userCounts = users.counts;
      } else if (route === "reports") {
        state.report = await api("/api/reports");
      }
      render();
      if (scroll !== false) window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      showToast(error.message);
      if (state.user) render();
    }
  }

  async function submitCheckin(token) {
    const result = await api("/api/check-ins/scan", { method: "POST", body: JSON.stringify({ token }) });
    const status = $("#scanStatus");
    if (status) {
      status.classList.add("checked");
      status.innerHTML = '<span class="status-icon">' + icon("check") + '</span><div><strong>Resident checked in</strong><span>' + escapeHtml(mealsMeta[result.meal.type]?.label || result.meal.type) + ' · ' + formatTime(result.checkedInAt) + (result.alreadyCheckedIn ? " · already recorded" : "") + '</span></div>';
    }
    $("#scanToken").value = "";
    showToast(result.alreadyCheckedIn ? "This resident was already checked in." : "Check-in recorded.");
  }

  async function startCamera() {
    if (!("BarcodeDetector" in window) || !navigator.mediaDevices?.getUserMedia) {
      showToast("Camera QR scanning is unavailable here. Paste the token manually.");
      return;
    }
    try {
      state.cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      const video = $("#cameraVideo");
      video.srcObject = state.cameraStream;
      $("#cameraPreview").hidden = false;
      await video.play();
      const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
      const scan = async () => {
        if (!state.cameraStream || state.scannerBusy) return;
        try {
          const found = await detector.detect(video);
          if (found.length) {
            state.scannerBusy = true;
            await submitCheckin(found[0].rawValue);
            stopCamera();
            return;
          }
        } catch (error) {
          stopCamera();
          showToast("Could not read the QR code. Paste the pass token instead.");
          return;
        }
        state.scannerFrame = requestAnimationFrame(scan);
      };
      state.scannerFrame = requestAnimationFrame(scan);
      showToast("Camera ready. Hold the meal pass in the frame.");
    } catch (error) {
      stopCamera();
      showToast("Camera access was denied or unavailable. Paste the token manually.");
    }
  }

  function stopCamera() {
    if (state.scannerFrame) cancelAnimationFrame(state.scannerFrame);
    state.scannerFrame = null;
    state.scannerBusy = false;
    if (state.cameraStream) state.cameraStream.getTracks().forEach(track => track.stop());
    state.cameraStream = null;
    const video = $("#cameraVideo");
    if (video) video.srcObject = null;
    const preview = $("#cameraPreview");
    if (preview) preview.hidden = true;
  }

  async function loadPass(type) {
    state.passType = type;
    state.pass = null;
    state.passError = "";
    render();
    try {
      state.pass = await api("/api/meals/" + encodeURIComponent(type) + "/pass?date=" + encodeURIComponent(state.date));
    } catch (error) {
      state.passError = error.message;
    }
    render();
  }

  async function saveMenu(event) {
    event.preventDefault();
    const type = $("#manageMealType").value;
    const fields = ["cutoff", "serveStart", "serveEnd"].map(id => $("#" + id).value);
    if (fields.some(value => !value)) {
      showToast("Set the cutoff and serving times first.");
      return;
    }
    const [cutoffAt, servingStartAt, servingEndAt] = fields.map(dateTimeInputToIso);
    await api("/api/admin/meals/" + encodeURIComponent(type), {
      method: "PUT",
      body: JSON.stringify({
        date: state.date,
        menu: $("#menuName").value.trim(),
        cutoffAt,
        servingStartAt,
        servingEndAt
      })
    });
    showToast("Menu changes saved.");
    await loadRoute("manage", false);
  }

  async function logWaste() {
    const menu = await api("/api/meals");
    state.date = menu.date;
    state.timeZone = menu.timeZone;
    state.meals = menu.meals;
    const options = state.meals.map(meal =>
      '<option value="' + meal.id + '"' + (meal.type === "lunch" ? " selected" : "") + '>' +
      escapeHtml(mealsMeta[meal.type].label) + " · " + escapeHtml(meal.menu) + '</option>'
    ).join("");
    const dialog = document.createElement("dialog");
    dialog.className = "app-dialog";
    dialog.id = "wasteDialog";
    dialog.innerHTML = '<form id="wasteForm"><div class="dialog-heading"><div><h2>Record kitchen waste</h2><p>Log leftovers for the selected meal.</p></div><button class="icon-button" type="button" data-close-dialog aria-label="Close dialog">×</button></div><div class="field"><label for="wasteMeal">Meal</label><select id="wasteMeal" required>' + options + '</select></div><div class="field"><label for="wasteKg">Wasted food (kg)</label><input id="wasteKg" type="number" min="0" max="10000" step="0.01" required></div><div class="field"><label for="wasteNote">Note (optional)</label><textarea id="wasteNote" maxlength="300"></textarea></div><div class="dialog-actions"><button class="button quiet" type="button" data-close-dialog>Cancel</button><button class="button primary" type="submit">Save waste log</button></div></form>';
    document.body.append(dialog);
    dialog.addEventListener("close", () => dialog.remove(), { once: true });
    dialog.showModal();
  }

  function downloadReport() {
    if (!state.report) return;
    const rows = [["date", "attendance_rate", "expected", "checked_in", "no_shows", "wasted_kg"]];
    state.report.daily.forEach(day => rows.push([day.date, day.attendanceRate, day.expected, day.checkedIn, day.noShows, day.wastedKg]));
    const csv = rows.map(row => row.map(value => '"' + String(value).replace(/"/g, '""') + '"').join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "plate-count-report-" + state.report.from + "-to-" + state.report.to + ".csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  function toggleAuthMode() {
    state.authMode = state.authMode === "login" ? "register" : "login";
    const registering = state.authMode === "register";
    $("#authTitle").textContent = registering ? "Join your dining hall" : "Welcome back";
    $("#authSubtitle").textContent = registering ? "Create your resident account to get started." : "Sign in to your campus kitchen.";
    $("#authSubmit").innerHTML = registering ? "Create account <span aria-hidden=\"true\">→</span>" : "Sign in <span aria-hidden=\"true\">→</span>";
    $("#authModeToggle").textContent = registering ? "I already have an account" : "Create a resident account";
    $("#registerNameField").hidden = !registering;
    $("#registerBlockField").hidden = !registering;
    $("#registerName").required = registering;
    $("#loginPassword").autocomplete = registering ? "new-password" : "current-password";
  }

  async function authenticateUser(event) {
    event.preventDefault();
    const registering = state.authMode === "register";
    const body = {
      email: $("#loginEmail").value.trim(),
      password: $("#loginPassword").value
    };
    if (registering) {
      body.name = $("#registerName").value.trim();
      body.residenceBlock = $("#registerBlock").value.trim();
    }
    try {
      const result = await api("/api/auth/" + (registering ? "register" : "login"), {
        method: "POST",
        body: JSON.stringify(body)
      });
      state.user = result.user;
      state.route = (routes[state.user.role] || routes.resident)[0][0];
      showApp();
      await loadRoute(state.route, false);
      showToast(registering ? "Your resident account is ready." : "Welcome back, " + result.user.name.split(/\s+/)[0] + ".");
    } catch (error) {
      showToast(error.message);
    }
  }

  function bindEvents() {
    document.addEventListener("click", async event => {
      const routeLink = event.target.closest("[data-route]");
      if (routeLink) {
        event.preventDefault();
        await loadRoute(routeLink.dataset.route);
        $("#profilePopover").hidden = true;
        return;
      }
      const go = event.target.closest("[data-go]");
      if (go) {
        await loadRoute(go.dataset.go);
        return;
      }
      const closeDialog = event.target.closest("[data-close-dialog]");
      if (closeDialog) {
        closeDialog.closest("dialog").close();
        return;
      }
      const choice = event.target.closest("[data-choice]");
      if (choice) {
        choice.disabled = true;
        try {
          await api("/api/meals/" + encodeURIComponent(choice.dataset.meal) + "/response", {
            method: "POST",
            body: JSON.stringify({ status: choice.dataset.choice })
          });
          showToast(choice.dataset.choice === "eating" ? "You’re on the list. The kitchen knows to expect you." : "Got it. The kitchen can plan for one less plate.");
          await loadRoute("today", false);
        } catch (error) {
          showToast(error.message);
          await loadRoute("today", false);
        }
        return;
      }
      if (event.target.closest("#themeToggle")) {
        state.theme = state.theme === "dark" ? "light" : "dark";
        document.documentElement.dataset.theme = state.theme;
        localStorage.setItem("plate-theme", state.theme);
        return;
      }
      if (event.target.closest("#profileButton")) {
        const popover = $("#profilePopover");
        popover.hidden = !popover.hidden;
        $("#profileButton").setAttribute("aria-expanded", String(!popover.hidden));
        return;
      }
      if (event.target.closest('[data-profile-action="logout"]')) {
        try { await api("/api/auth/logout", { method: "POST" }); } catch (error) { showToast(error.message); }
        showLogin();
        return;
      }
      if (event.target.closest("#authModeToggle")) {
        toggleAuthMode();
        return;
      }
      if (event.target.closest("#startCamera")) {
        await startCamera();
        return;
      }
      if (event.target.closest("#refreshCounts")) {
        await loadRoute("kitchen", false);
        showToast("Headcount refreshed.");
        return;
      }
      const action = event.target.closest("[data-action]");
      if (action) {
        try {
          if (action.dataset.action === "export") downloadReport();
          if (action.dataset.action === "invite") $("#inviteDialog").showModal();
          if (action.dataset.action === "log-waste") await logWaste();
        } catch (error) {
          showToast(error.message);
        }
      }
    });

    document.addEventListener("change", async event => {
      if (event.target.id === "passMealType") await loadPass(event.target.value);
      if (event.target.id === "manageMealType") {
        state.manageMealType = event.target.value;
        const meal = state.meals.find(item => item.type === event.target.value);
        if (!meal) return;
        $("#menuName").value = meal.menu;
        $("#cutoff").value = toDateTimeInput(meal.cutoffAt);
        $("#serveStart").value = toDateTimeInput(meal.servingStartAt);
        $("#serveEnd").value = toDateTimeInput(meal.servingEndAt);
      }
    });

    document.addEventListener("submit", async event => {
      if (event.target.id === "loginForm") {
        await authenticateUser(event);
      } else if (event.target.id === "menuForm") {
        try { await saveMenu(event); } catch (error) { showToast(error.message); }
      } else if (event.target.id === "manualScanForm") {
        event.preventDefault();
        try { await submitCheckin($("#scanToken").value.trim()); } catch (error) { showToast(error.message); }
      } else if (event.target.id === "inviteForm") {
        event.preventDefault();
        try {
          await api("/api/admin/users", {
            method: "POST",
            body: JSON.stringify({
              name: $("#inviteName").value.trim(),
              email: $("#inviteEmail").value.trim(),
              role: $("#inviteRole").value,
              residenceBlock: $("#inviteBlock").value.trim(),
              password: $("#invitePassword").value
            })
          });
          $("#inviteDialog").close();
          showToast("Account created.");
          await loadRoute("manage", false);
        } catch (error) { showToast(error.message); }
      } else if (event.target.id === "wasteForm") {
        event.preventDefault();
        try {
          await api("/api/reports/waste", {
            method: "POST",
            body: JSON.stringify({
              mealId: $("#wasteMeal").value,
              wastedKg: Number($("#wasteKg").value),
              note: $("#wasteNote").value.trim()
            })
          });
          $("#wasteDialog").close();
          showToast("Waste entry recorded.");
          if (state.route === "reports") await loadRoute("reports", false);
        } catch (error) { showToast(error.message); }
      }
    });
  }

  async function initialize() {
    document.documentElement.dataset.theme = state.theme;
    $("#roleBadge").textContent = "Sign in required";
    try {
      const response = await api("/api/auth/me");
      if (response.user) {
        state.user = response.user;
        state.route = (routes[state.user.role] || routes.resident)[0][0];
        showApp();
        await loadRoute(state.route, false);
      } else {
        showLogin();
      }
    } catch (error) {
      showLogin();
    }
    bindEvents();
    setInterval(() => {
      if (state.user && state.route === "today") {
        const banner = $(".deadline-banner .countdown");
        if (banner) {
          const meal = state.meals.filter(item => !isLocked(item)).sort((a, b) => new Date(a.cutoffAt) - new Date(b.cutoffAt))[0];
          banner.textContent = meal ? countdown(meal) : "CLOSED";
        }
        $$(".meal-card").forEach((card, index) => {
          const meal = state.meals[index];
          if (meal && isLocked(meal)) $$(".choice-button", card).forEach(button => button.disabled = true);
        });
      }
      if (state.user && state.route === "kitchen") loadRoute("kitchen", false);
    }, 15000);
    window.addEventListener("beforeunload", stopCamera);
  }

  initialize();
})();
