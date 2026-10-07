# Deploying Sakhi Shield

Two pieces, deployed separately:

| Piece | Where | What it does |
|---|---|---|
| Front-end | GitHub Pages (already live) | All 11 pages. Works offline. |
| Backend | Render | Accounts, cloud sync, SOS alerts by SMS/email |

GitHub Pages cannot run a Node server, so the backend needs its own host. That is
why account sign-up and cloud sync do not work on the Pages URL until you finish
the steps below.

**The chatbot is the exception** - it can call the AI provider straight from the
browser, so it works without a backend. Set it up on the Account page.

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

## 2. Point the front-end at it (about 30 seconds)

1. Open your Pages site's Account page:
   `https://<username>.github.io/sakhi-shield/account.html`
2. In the **Backend connection** card, paste the Render URL into **Backend URL**.
3. Press **Save**, then **Test connection**.
4. It should read: `Connected. Alerts - email: off, SMS: off, AI chat: on.`

The URL is stored on your device, so there is no code change and no redeploy.
Account sign-up, login, contact sync and SOS alerts now work.

## 3. Optional - make the alerts actually send

By default the backend **logs** alert emails and SMS instead of sending them, so
you can test the whole flow for free. To send for real, add these in Render under
**Environment**:

| Purpose | Variables |
|---|---|
| Email | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` |
| SMS | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` |
| AI chat | `LLM_API_KEY` (and `LLM_PROVIDER` = `groq` / `gemini` / `openai` / ...) |

Saving an environment variable triggers a redeploy.

For AI chat, `LLM_PROVIDER=groq` with a free key from **console.groq.com** is the
most reliable option. The default `pollinations` needs no key but is frequently
down.

---

## Things that will surprise you

- **The free instance sleeps** after ~15 minutes idle. The next request takes
  ~30 seconds to wake it. Normal, not a bug.
- **The filesystem is ephemeral.** The SQLite file is wiped on every redeploy or
  restart, so registered accounts disappear. Fine for a demo; attach a paid
  persistent disk or move `server/db.js` to Postgres for real use.
- **Data lives in two places.** Contacts you add on the Contacts page are on the
  device. Signing in and pressing "Sync contacts" copies them to the server.

## Troubleshooting

| What you see | What it means |
|---|---|
| `No backend is connected to this site yet` | Step 2 is not done, or the URL is wrong. |
| `Not reachable (Cannot reach the server)` | The Render URL is wrong, or the service is asleep - wait 30s and retry. |
| Render build fails on `better-sqlite3` | Re-run the deploy; it is usually a transient native-build hiccup. |
| `That email already has an account` | Switch to **Log in** on the Account page. |
| Chatbot says it could not reach the AI service | Set a provider and key on the Account page, or add `LLM_API_KEY` in Render. |

## Running it locally instead

```bash
npm install
npm start          # http://localhost:3000
```

No backend URL needed when you open it from the server itself - it uses the same
origin automatically.
