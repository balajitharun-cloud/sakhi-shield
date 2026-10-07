# Deploying Sakhi Shield

Two pieces, deployed separately:

| Piece | Where | What it does |
|---|---|---|
| Front-end | GitHub Pages (already live) | All 10 pages. Works offline. |
| Backend | Render | The AI assistant (and the API for SOS alerts / live-location links) |

GitHub Pages cannot run a Node server, so the backend needs its own host. The
front-end works fully offline without it. **Sakhi Assistant** is the one feature
that needs an AI key - either the server holds it (best: it works for everyone), or
a user pastes their own free key into the chat's gear menu, which works immediately
with no backend at all.

---

## 1. Deploy the backend on Render (about 3 minutes, free)

1. Go to **https://render.com** and sign up. "Sign in with GitHub" is easiest -
   it also lets Render see your repos.
2. On the dashboard click **New** → **Blueprint**.
3. Pick the **`sakhi-shield`** repository and click **Connect** / **Apply**.
4. Render reads `render.yaml` and creates a free web service called
   `sakhi-shield`. Leave everything as it is and let it build.
   The first build takes a few minutes (`better-sqlite3` compiles a native addon).
5. When it goes live you get a URL like:

   ```
   https://sakhi-shield.onrender.com
   ```

   Open it - you should see the same app, served by the backend.

If you would rather not use a Blueprint: **New → Web Service**, pick the repo, set
Build Command `npm install` and Start Command `npm start`.

## 2. Point the front-end at it (normally automatic)

The Pages site already knows where the backend lives: the address is built into
the pages as `https://sakhi-shield.onrender.com`, which is what the blueprint
names the service. So if the service is called `sakhi-shield`, **there is nothing
to do** - the assistant works as soon as Render is live.

If Render had to name it something else (it appends a suffix when a name is taken,
e.g. `sakhi-shield-a1b2.onrender.com`), you have two options:

- **Easiest:** in Render, rename the service to `sakhi-shield`.
- **Or** append the real URL to the page address once: `?api=https://your-service.onrender.com`.
  It is remembered on that device.

To change it for everyone, edit the `api-base` line in `build_pages.py` and
rebuild (`python3 build_pages.py`), then commit.

## 3. Privacy - what is stored where

- With a server key, it lives in the environment variables and is never sent to the
  browser. A key pasted into the chat's gear menu stays in that device's localStorage
  and is sent only to the AI provider the user chose.
- Trusted contacts, evidence and the F.I.R. draft stay on the device (localStorage
  and IndexedDB). Nothing is uploaded.
- The server hashes passwords with bcrypt and issues short-lived JWTs, but the
  front-end no longer exposes an account screen.

## 4. Optional - make the alerts actually send

By default the backend **logs** alert emails and SMS instead of sending them, so
you can test the whole flow for free. To send for real, add these in Render under
**Environment**:

| Purpose | Variables |
|---|---|
| Email | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` |
| SMS | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` |
| AI chat | `LLM_API_KEY` (and `LLM_PROVIDER` = `groq` / `gemini` / `openai` / ...) |

Saving an environment variable triggers a redeploy.

For the assistant, `LLM_PROVIDER=groq` with a free key from **console.groq.com** is
the most reliable option; `gemini` with a key from **aistudio.google.com** works too.
There is no longer any working keyless provider - the old default (`pollinations`)
now returns 500 or 402 Payment Required, which is why the assistant used to sit on
"Thinking..." and give up. Both providers were checked directly: a bogus key returns
a clean 401 from Groq and 400 from Google, so a real key works.

---

## Things that will surprise you

- **The free instance sleeps** after ~15 minutes idle. The next request takes
  ~30 seconds to wake it. Normal, not a bug.
- **The filesystem is ephemeral.** The SQLite file is wiped on every redeploy or
  restart. Fine for a demo; uncomment the `disk:` block in `render.yaml` and set
  `DB_PATH=/var/data/sakhi.sqlite` for durable storage.
- **Everything the user creates stays on the device.** Contacts, evidence and the
  F.I.R. draft never leave the browser.

## Troubleshooting

| What you see | What it means |
|---|---|
| `No server is connected to this site yet` | Step 2 is not done, or the URL is wrong. |
| `Cannot reach the server` | The Render URL is wrong, or the service is asleep - wait 30s and retry. |
| `The server did not answer within 25 seconds` | The service was asleep or the AI provider is slow; retry. |
| Render build fails on `better-sqlite3` | Re-run the deploy; it is usually a transient native-build hiccup. |
| The assistant says it could not answer | No key anywhere. Paste one via the chat's gear menu, or set `LLM_PROVIDER` + `LLM_API_KEY` in Render. |
| "That does not look like a Groq or Google key" | The key must start with `gsk_` (Groq) or `AIza` (Google). |

## Running it locally instead

```bash
npm install
npm start          # http://localhost:3000
```

No backend URL needed when you open it from the server itself - it uses the same
origin automatically.
