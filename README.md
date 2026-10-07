# Sakhi Shield

A personal women-safety web app with a Node.js backend. The front-end is a single
self-contained HTML file; the backend adds the things a browser can't do alone —
alerting your trusted contacts when SOS fires, storing contacts and incident
reports, and publishing a live-location link others can open.

## What's here

```
sakhi-shield/
├── docs/                     the front-end - one page per feature
│   ├── index.html            home: SOS button + a link to every feature
│   ├── sos.html              SOS, siren, motion sensor, alert history
│   ├── helplines.html        emergency numbers
│   ├── location.html         live location + journey tracking
│   ├── contacts.html         trusted contacts
│   ├── tools.html            fake call, check-in timer, sensor settings
│   ├── evidence.html         camera, audio/video recording, evidence vault
│   ├── safety.html           safety tips
│   ├── rights.html           legal rights (India)
│   ├── complaint.html        Form SS-1 police complaint sheet
│   ├── account.html          account + backend connection
│   └── assets/
│       ├── css/style.css     all styling, shared by every page
│       └── js/
│           ├── i18n.js       the EN/HI/KN dictionary (291 strings)
│           ├── data.js       helplines, tips, rights, chatbot knowledge base
│           ├── core.js       utils, theme, i18n engine, API client, chatbot
│           ├── sos.js        SOS, siren, motion sensor, auto-notify
│           ├── location.js   live location and journey tracking
│           ├── contacts.js   trusted contacts
│           ├── tools.js      fake call + check-in timer
│           ├── evidence.js   camera, recording and the evidence vault
│           ├── complaint.js  the complaint sheet
│           └── account.js    account and backend URL
├── server/
│   ├── index.js          Express app + all routes
│   ├── db.js             SQLite schema and queries (better-sqlite3)
│   ├── auth.js           bcrypt hashing + JWT bearer tokens
│   ├── notify.js         email (nodemailer) + SMS (Twilio), with graceful fallback
│   ├── chat.js           AI chat: 6 providers, or a built-in knowledge base
│   └── sharePage.js      the public live-location viewer page
├── test/
│   ├── api.test.js       end-to-end API test (69 checks)
│   └── i18n.test.js      front-end test across all 11 pages (55 checks)
├── render.yaml           one-click Render blueprint
└── .env.example          every config knob, documented
```

## Features

**Front-end (works offline, no server needed)**
- **One page per feature** - home, SOS, helplines, location, contacts, tools, evidence, safety, rights, complaint and account
- Mobile-first: 44px touch targets, 16px inputs (no iOS zoom), safe-area insets, responsive complaint sheet
- Three languages - English, हिंदी and ಕನ್ನಡ - with a switcher in the header; the whole UI, the tips, the rights and the chatbot are translated
- **Sakhi Assistant chatbot** backed by a live AI API, with a localised knowledge base as the offline fallback
- **SOS with automatic delivery**: arming it sends your live location to your trusted contacts by itself - no extra tap
- **Motion sensor**: shake the phone to arm the SOS, with a proper iOS permission request and a sensitivity setting
- **Camera & recording** - take a photo, or record audio/video as proof. Everything is geo-tagged, timestamped and stored in an on-device vault (IndexedDB); download anything you need for the police. Can auto-start recording when the SOS fires.
- Panic siren generated with the Web Audio API
- Emergency helplines (India): 112, 100, 101, 102, 181, 1091, NCW, 1098, Tele-MANAS 14416, 1930
- Live location, journey tracking, map preview
- Trusted contacts stored in localStorage
- Fake call, check-in timer
- Safety tips and legal rights (India)
- **Form SS-1 police complaint sheet** - a formal, numbered complaint form in the
  style of an official report sheet, which generates a written complaint you can
  hand to the police, email, or save

**Backend (what the server adds)**
- Accounts with hashed passwords and JWT login
- Trusted contacts and complaint sheets stored per user in a database
- `POST /api/sos` creates an alert, **emails/SMSes your contacts**, and returns a
  public live-location link
- A public viewer at `/s/<token>` that a contact opens in any browser — no app needed
- Alert history you can resolve when you're safe
- `POST /api/chat` answers safety questions (LLM if a key is set, built-in knowledge
  base otherwise) in English, Hindi or Kannada

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
| GET  | `/api/complaints` | yes | List saved complaint sheets |
| POST | `/api/complaints` | yes | Save a Form SS-1 complaint sheet |
| DELETE | `/api/complaints/:id` | yes | Delete a complaint sheet |
| POST | `/api/chat` | no | `{message, lang}` → `{reply, source}` (LLM or knowledge base) |
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
   - Chatbot: the AI provider. The default `pollinations` is a free public
     endpoint needing no key; `openai`/`groq`/`openrouter`/`anthropic`/`gemini`
     need `LLM_API_KEY`; `off` uses only the built-in knowledge base.
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
