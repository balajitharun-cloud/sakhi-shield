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
│   ├── complaint.html        A4 F.I.R. sheet builder
│   └── assets/
│       ├── css/style.css     all styling, shared by every page
│       └── js/
│           ├── i18n.js       the EN/HI/KN dictionary
│           ├── data.js       helplines, tips and rights content
│           ├── core.js       utils, theme, i18n engine, API client, assistant
│           ├── sos.js        SOS, siren, motion sensor, contact alerts
│           ├── location.js   live location and journey tracking
│           ├── contacts.js   trusted contacts
│           ├── tools.js      fake call + check-in timer
│           ├── evidence.js   camera, recording and the evidence vault
│           ├── complaint.js  the complaint sheet
├── server/
│   ├── index.js          Express app + all routes
│   ├── db.js             SQLite schema and queries (better-sqlite3)
│   ├── auth.js           bcrypt hashing + JWT bearer tokens
│   ├── notify.js         email (nodemailer) + SMS (Twilio), with graceful fallback
│   ├── chat.js           AI chat: 6 providers, no canned answers
│   └── sharePage.js      the public live-location viewer page
├── test/
│   ├── api.test.js       end-to-end API test (77 checks)
│   └── i18n.test.js      front-end test across all 11 pages (89 checks)
├── render.yaml           one-click Render blueprint
└── .env.example          every config knob, documented
```

## Features

**Front-end (works offline, no server needed)**
- **One page per feature** - home, SOS, helplines, location, contacts, tools, evidence, safety, rights and complaint
- Mobile-first: 44px touch targets, 16px inputs (no iOS zoom), safe-area insets, responsive complaint sheet
- Three languages - English, हिंदी and ಕನ್ನಡ - with a switcher in the header; the whole UI, the tips, the rights and the chatbot are translated
- **Sakhi Assistant** - AI only, and it runs entirely on the server: the browser sends your question to `POST /api/chat` and the AI key never leaves the backend. Set `LLM_PROVIDER` and `LLM_API_KEY` in Render. There is no canned keyword-answer fallback; if the AI service does not respond the assistant says so, and it never leaves a question hanging.
- **SOS with automatic delivery**: arming it sends your live location to your trusted contacts by itself - no extra tap
- **Motion sensor**: shake the phone to arm the SOS, with a proper iOS permission request and a sensitivity setting
- **Camera & recording** - take a photo, or record audio/video as proof. Everything is geo-tagged, timestamped and stored in an on-device vault (IndexedDB); download anything you need for the police. Can auto-start recording when the SOS fires.
- Panic siren generated with the Web Audio API
- Emergency helplines (India): 112, 100, 101, 102, 181, 1091, NCW, 1098, Tele-MANAS 14416, 1930
- Live location, journey tracking, map preview
- Trusted contacts stored in localStorage
- Fake call, check-in timer
- Safety tips and legal rights (India)
- **A4 F.I.R. builder** - a detailed F.I.R.-format sheet (Sections A-F: occurrence, complainant, accused, witnesses/property, facts, action, plus an office-use block). It fills in live as you type, prints or saves as an A4 PDF, and exports as a standalone A4 `.html` file.

**Backend (what the server adds)**
- The AI assistant, so the key stays on the server and not in the browser
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

## Deploy

**The front-end and the backend are deployed separately.** GitHub Pages serves
`docs/` as a static site; it cannot run the Node server. The backend has to go to a
host such as Render, and the front-end then has to be told where it is.

1. Front-end (already done): GitHub Pages serves `docs/` at
   `https://<username>.github.io/sakhi-shield/`.
2. Backend: on Render, **New -> Blueprint**, pick this repo. `render.yaml`
   configures the service. You get `https://<service-name>.onrender.com`.
3. Nothing to point. The pages already carry the backend address, and the
   blueprint names the service `sakhi-shield`, so `https://sakhi-shield.onrender.com`
   is correct out of the box. If Render had to rename the service, edit the
   `api-base` line in `build_pages.py` and rebuild, or set an override in the
   page URL with `?api=https://your-service.onrender.com`.

The assistant needs the server, so until step 2 is done it will say it cannot
reach it. Everything else works offline.

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
     need `LLM_API_KEY`; `off` disables the assistant.

     **The assistant is AI only - there is no offline fallback.** The free
     `pollinations` endpoint is the only keyless option and it is frequently
     busy or down (it has been returning 402/500), so for anything real you
     should set your own key. Groq and Google AI Studio both have free tiers;
     set `LLM_PROVIDER=groq` and `LLM_API_KEY=...`.
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

Pages serves static files only, so on that URL every offline feature works (SOS,
siren, helplines, tips, rights, the F.I.R. builder, the on-device evidence vault).
Only the assistant needs the backend. The address is already baked in:

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
