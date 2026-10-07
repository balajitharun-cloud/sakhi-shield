# Sakhi Shield

A personal women-safety web app with a Node.js backend. The front-end is a single
self-contained HTML file; the backend adds the things a browser can't do alone —
alerting your trusted contacts when SOS fires, storing contacts and incident
reports, and publishing a live-location link others can open.

## What's here

```
sakhi-shield/
├── docs/index.html       the whole front-end (HTML + CSS + JS, no build step)
│                         also served by GitHub Pages
├── server/
│   ├── index.js          Express app + all routes
│   ├── db.js             SQLite schema and queries (better-sqlite3)
│   ├── auth.js           bcrypt hashing + JWT bearer tokens
│   ├── notify.js         email (nodemailer) + SMS (Twilio), with graceful fallback
│   └── sharePage.js      the public live-location viewer page
├── test/api.test.js      end-to-end API test (42 checks)
├── render.yaml           one-click Render blueprint
└── .env.example          every config knob, documented
```

## Features

**Front-end (works offline, no server needed)**
- SOS button with a 5-second cancellable countdown
- Panic siren generated with the Web Audio API
- Emergency helplines (India): 112, 100, 101, 102, 181, 1091, NCW, 1098, Tele-MANAS 14416, 1930
- Live location, journey tracking, map preview
- Trusted contacts stored in localStorage
- Fake call, check-in timer
- Shake-to-SOS (device motion), vibration, screen flash
- Safety tips, legal rights, incident-report generator

**Backend (what the server adds)**
- Accounts with hashed passwords and JWT login
- Trusted contacts stored per user in a database
- Incident reports stored per user
- `POST /api/sos` creates an alert, **emails/SMSes your contacts**, and returns a
  public live-location link
- A public viewer at `/s/<token>` that a contact opens in any browser — no app needed
- Alert history you can resolve when you're safe

> **On motion:** shake-to-SOS reads your phone's accelerometer through the
> browser's `DeviceMotion` API. A server has no access to that sensor, so motion
> detection stays in the front-end. The backend handles the *response* to an SOS,
> not the detection of the shake.

## Run locally

```bash
npm install
cp .env.example .env      # optional; defaults work out of the box
npm start
# open http://localhost:3000
```

Without SMTP/Twilio credentials, alert emails and SMS are **printed to the
console** instead of sent, so you can test the whole flow for free. Add the
credentials in `.env` to switch to real delivery.

Run the tests:

```bash
npm test        # 42 end-to-end API checks against a throwaway database
```

## API

All authenticated routes take `Authorization: Bearer <token>`.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET  | `/api/health` | no | Service status + which alert channels are configured |
| POST | `/api/auth/register` | no | `{name, email, password}` → `{token, user}` |
| POST | `/api/auth/login` | no | `{email, password}` → `{token, user}` |
| GET  | `/api/auth/me` | yes | Current user |
| GET  | `/api/contacts` | yes | List trusted contacts |
| POST | `/api/contacts` | yes | `{name, phone?, email?}` (max 8) |
| DELETE | `/api/contacts/:id` | yes | Remove a contact |
| GET  | `/api/reports` | yes | List incident reports |
| POST | `/api/reports` | yes | `{happenedAt, place, people, description, lat, lng}` |
| DELETE | `/api/reports/:id` | yes | Delete a report |
| POST | `/api/sos` | yes | `{lat, lng, accuracy, message}` → creates alert, notifies contacts, returns `shareUrl` |
| GET  | `/api/alerts` | yes | Alert history |
| POST | `/api/alerts/:id/location` | yes | Push a new GPS point to a live alert |
| POST | `/api/alerts/:id/resolve` | yes | Mark yourself safe |
| GET  | `/api/public/share/:token` | no | What the share viewer polls |
| GET  | `/s/:token` | no | Public live-location page |

## Deploy on Render (free tier)

1. Push this repo to GitHub.
2. On [Render](https://render.com): **New → Blueprint**, pick this repo.
   Render reads `render.yaml` and creates the web service automatically.
   (Or **New → Web Service** and set build `npm install`, start `npm start`.)
3. Add your secrets in **Environment** if you want real alerts:
   - Email: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`
   - SMS: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`
4. Your app is live at `https://<service-name>.onrender.com`.

**Free-tier caveats:** the instance sleeps after ~15 minutes idle (first request
after that takes ~30s to wake), and the filesystem is ephemeral — the SQLite file
resets on redeploy. Use a paid persistent disk, or swap `db.js` for Postgres, if
you need durable data.

### Front-end on GitHub Pages

The front-end is also published on GitHub Pages from the `docs/` folder, so there
is a live URL even before the backend is deployed:

```
https://<username>.github.io/sakhi-shield/
```

Pages serves static files only, so on that URL the offline features (SOS, siren,
helplines, tips, rights, report generator) work, but the Account section reports
the server as unreachable until you deploy the backend and set the API origin:

```html
<meta name="api-base" content="https://your-service.onrender.com">
```

Leave it empty when the Express server serves the page itself (the default).

## Security notes

- Passwords are hashed with bcrypt; only the hash is stored.
- JWTs are signed with `JWT_SECRET` — Render generates a random one; set your own
  anywhere else. Never commit `.env`.
- Share links use 128-bit random tokens, are unguessable, and can be revoked by
  resolving the alert.
- Auth and SOS endpoints are rate-limited.

## Disclaimer

This is a demo project, not a replacement for emergency services.
In a real emergency, call **112**.
