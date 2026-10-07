# Deploying Sakhi Shield

Two pieces, deployed separately:

| Piece | Where | What it does |
|---|---|---|
| Front-end | GitHub Pages (already live) | All 10 pages. Works offline. |
| Backend | Render | The AI assistant (and the API for SOS alerts / live-location links) |

GitHub Pages cannot run a Node server, so the backend needs its own host. The
front-end works fully offline without it; the one feature that needs the server is
**Sakhi Assistant**, because the AI key is held on the server rather than in the
browser.

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

- The AI key lives in the server's environment variables and is never sent to the
  browser. There is no key field anywhere in the front-end.
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
the most reliable option. The default `pollinations` needs no key but is frequently
down, which is why the assistant used to sit on "Thinking..." and give up.

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
| The assistant says it could not answer | `LLM_API_KEY` is unset in Render, or the provider is down. |

## Running it locally instead

```bash
npm install
npm start          # http://localhost:3000
```

No backend URL needed when you open it from the server itself - it uses the same
origin automatically.
