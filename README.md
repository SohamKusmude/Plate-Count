# Plate Count

Plate Count is a meal-planning and food-waste reduction app for hostels and campus dining teams. The existing responsive HTML/CSS screens are served by an Express API backed by MongoDB.

## What works

- Resident signup and sign-in; accounts are assigned the resident role by the server.
- Admin-managed accounts for residents, cooks and admins. Roles cannot be chosen during public signup.
- Meal menus and schedules stored in MongoDB. Admins can update them at any time; moving a cutoff into the future reopens resident choices, while a cutoff in the past keeps them locked.
- Meal service status changes automatically from the saved serving window and is shown to residents and the kitchen. Cooks can mark prep complete and confirm serving completion after its scheduled end; changing the menu or serving window clears stale completion marks.
- One response per resident and meal. Unanswered residents remain included in the kitchen headcount.
- Cook/admin-only kitchen headcounts and QR scanner.
- Short-lived, signed meal passes; check-in scans are accepted only during the serving window.
- Resident meal history, admin attendance/no-show/waste reports, CSV export and waste logging.
- HttpOnly, SameSite session cookies; password hashing; login rate limiting.
- Time-limited, single-use password reset links delivered by SMTP email. Password changes invalidate existing sessions.
- Admin account deletion removes the user's meal responses and check-in history. An admin cannot delete their own account.

This is a single-origin app. Do not serve `index.html` directly from `file://`; use the Express server so the API and session cookie work.

## Run locally

Requirements: Node.js 20+ and a MongoDB instance (local MongoDB or MongoDB Atlas).

1. In this directory, copy `.env.example` to `.env`.
2. Set `MONGODB_URI`, `JWT_SECRET`, and `QR_SECRET`. Use two different random secrets, each at least 32 characters. Keep `.env` private.
3. Install and start:

   ```sh
   npm install
   npm start
   ```

4. Open `http://localhost:3000`. Residents can create accounts from the sign-in screen.
5. To create the first administrator, set `ADMIN_NAME`, `ADMIN_EMAIL`, and a strong `ADMIN_PASSWORD` in `.env`, then run:

   ```sh
   npm run seed:admin
   ```

   Remove the three `ADMIN_*` values when setup is complete. Sign in as that admin to create cook and other admin accounts.

Default meal schedules use `APP_TIME_ZONE` (default `Asia/Kolkata`). Change it to an IANA time-zone name for the dining hall. A date-specific meal is created with the default menu the first time it is requested; admins can edit the menu and schedule at any time. If an admin moves a cutoff into the future, residents can update their choices until that new cutoff.

### Password recovery email

Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, and `SMTP_FROM`. If the SMTP server requires authentication, also set `SMTP_USER` and `SMTP_PASS`. Set `APP_BASE_URL` to the public app origin when it cannot be detected automatically; Render uses its `RENDER_EXTERNAL_URL` by default. Keep SMTP credentials in private environment settings, never in source control. The password-reset link expires after one hour and can only be used once.

## Deploy to Render

The included `render.yaml` defines a Node web service and generates separate session and QR secrets. Before deploying:

1. Create a MongoDB Atlas database and allow the deployed service to connect. Prefer a narrowly scoped database user; do not commit its URI.
2. Push this folder to a Git repository and create a Render Blueprint from that repository.
3. Enter the MongoDB and SMTP settings when Render asks for unsynced values. Set `APP_BASE_URL` to the deployed HTTPS origin and keep `APP_TIME_ZONE` set to the dining hall's IANA zone. Password reset is unavailable until SMTP is configured.
4. After the first deploy, create the initial admin using a trusted local environment with the production `MONGODB_URI` and temporary `ADMIN_*` variables, or create the first admin directly in the database with a securely generated bcrypt hash. Never add bootstrap credentials to source control or permanent service environment variables.
5. Use the generated HTTPS URL. Camera QR scanning requires HTTPS; cook accounts can also paste a valid pass token if camera scanning is unavailable.

`/api/health` reports whether the service is connected to MongoDB. The app intentionally fails to start if the database URI or signing secrets are missing.

## Checks

```sh
npm test
```

The tests cover meal date/time handling, serving status boundaries, and authenticated meal, kitchen, cutoff and check-in API workflows.

