# ✦ Humanize AI Text — Chrome Extension

> Select any AI-generated text in any editable field on any website → click the floating **✦ Humanize** button → the text is rewritten in place to sound human.

---

## What This Project Does

AI-generated text has tells: hedging phrases, em-dash overuse, "delve into," "tapestry of," forced rule-of-three lists, sycophantic openers. This tool strips those patterns out and rewrites the selection in a natural, human voice — without you ever leaving the page you're working in.

It works anywhere you can type: Gmail, Outlook Web, Notion, LinkedIn, ChatGPT, Google Docs, standard `<textarea>` / `<input>` fields, and `contentEditable` rich-text editors.

---

## How It Works

The project is split into two pieces that talk over HTTPS:

| Part | Responsibility |
|------|---------------|
| **Chrome extension** ([extension/](extension/)) | Watches text selections inside editable fields, shows a floating **✦ Humanize** button above the selection, sends the selected text to the backend, and writes the response back into the page. |
| **Node.js backend** ([backend/](backend/)) | Receives `POST /humanize`, authenticates the request with a shared secret, and forwards the text to Anthropic's Claude API along with a humanizer system prompt loaded from `SKILL.md`. |

### Request flow

```
 ┌────────────────┐    selection     ┌────────────────────┐    Claude API    ┌──────────┐
 │  Web page      │ ───────────────► │  content.js        │ ───────────────► │  Claude  │
 │  (Gmail, etc.) │                  │  (extension)       │                  │  Haiku   │
 └────────────────┘                  └─────────┬──────────┘                  └────┬─────┘
        ▲                                      │ POST /humanize                   │
        │ rewritten                            │ x-office-secret: …               │
        │ text                                 ▼                                  │
        │                            ┌────────────────────┐                       │
        └────────────────────────────│  server.js         │ ◄─────────────────────┘
                                     │  (Express, Render) │   humanized text
                                     └────────────────────┘
```

### Key implementation details

- **Selection detection** ([extension/content.js:15-45](extension/content.js#L15-L45)) walks the DOM from the selection anchor up, recognising `<textarea>`, `<input>`, `contenteditable`, `role="textbox"`, and Google Docs/Slides shells so the button only appears where text can be replaced.
- **Text replacement** ([extension/content.js:152-183](extension/content.js#L152-L183)) handles three cases: native form fields (mutating `value` + dispatching `input`/`change`), `contentEditable` ranges (`range.deleteContents` + `insertNode`), and a `document.execCommand("insertText")` fallback for editors like Google Docs.
- **Auth** ([backend/server.js:56-65](backend/server.js#L56-L65)) is mandatory — every request must carry the `x-office-secret` header matching the server's `OFFICE_SECRET`. `/health` is the only exempt route.
- **Humanizer prompt** ([backend/skills/SKILL.md](backend/skills/SKILL.md)) is the editable rulebook. The server loads it at startup and strips any YAML frontmatter. Edit this file (not `server.js`) to tune the rewriting behaviour.
- **Prompt caching** ([backend/server.js:85-91](backend/server.js#L85-L91)) wraps the system prompt in `cache_control: { type: "ephemeral" }`, so the long SKILL prompt is billed at 10% after the first call within the cache window. Cache hits/misses are logged.
- **Model**: `claude-haiku-4-5-20251001` — fast and cheap for this use case.
- **Limits**: requests over 8000 characters are rejected ([backend/server.js:77-79](backend/server.js#L77-L79)).

---

## Project Structure

```
Humanizer-Chrome-Tool/
├── extension/                  ← Load this folder into Chrome
│   ├── manifest.json           ← MV3 manifest (content script, action popup)
│   ├── content.js              ← Selection detection, floating button, replacement
│   ├── popup.css               ← Styles for the floating button + toast
│   ├── background.js           ← Service worker (lifecycle only)
│   ├── settings.html           ← Toolbar popup — backend URL + secret
│   ├── settings.js
│   └── icons/                  ← 16 / 48 / 128 px icons
└── backend/                    ← Node.js / Express server
    ├── server.js               ← /humanize + /health endpoints
    ├── skills/
    │   └── SKILL.md            ← The humanizer system prompt — edit to tune behaviour
    ├── package.json
    └── .env.example
```

---

## Local Setup

### Prerequisites
- **Node.js 18+**
- An **Anthropic API key** — get one at https://console.anthropic.com
- **Google Chrome** (or any Chromium-based browser)

### 1. Run the backend

```bash
cd backend
npm install
cp .env.example .env
```

Fill in [backend/.env](backend/.env):

```
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxx
PORT=3000
OFFICE_SECRET=<paste-a-long-random-string-here>
```

Generate a strong `OFFICE_SECRET` with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

> ⚠️ The server **will not start** without `OFFICE_SECRET` — this is intentional, so a backend is never deployed without auth.

Start the server:

```bash
npm start        # production
npm run dev      # auto-restart on file changes (node --watch)
```

You should see:

```
✦ Loaded skill: …/backend/skills/SKILL.md
✦ Humanizer backend running at http://localhost:3000
  POST /humanize  — main endpoint
  GET  /health    — health check
  Auth enabled    — requests require x-office-secret header
```

Smoke test:

```bash
curl http://localhost:3000/health
# → {"status":"ok","service":"humanizer-backend"}
```

### 2. Load the extension into Chrome

1. Open `chrome://extensions`
2. Toggle **Developer mode** on (top-right)
3. Click **Load unpacked**
4. Select the [extension/](extension/) folder
5. The **✦** icon now appears in the Chrome toolbar

### 3. Point the extension at your backend

1. Click the **✦** toolbar icon to open the settings popup
2. **Backend URL**: `http://localhost:3000` (or your deployed URL)
3. **Office Secret**: the same `OFFICE_SECRET` value from `.env`
4. Click **Save Settings**

> The extension ships with a default Backend URL pointing at the maintainer's Render deployment ([extension/settings.js:6](extension/settings.js#L6)) — change this to your own server before relying on it.

### 4. Try it out

1. Open Gmail (or Notion / LinkedIn / any text field)
2. Paste in some AI-generated text
3. Select it with your mouse — the **✦ Humanize** button appears above
4. Click it. The text is replaced in place. A toast confirms success.

---

## Deploying the Backend (for a team)

Anyone using the extension needs to reach a running backend. Pick whichever fits:

**Cloud (recommended, works for remote teams)**
Any Node host works. The included setup is deployed to **Render** — connect the GitHub repo, set `ANTHROPIC_API_KEY` and `OFFICE_SECRET` as environment variables, and you're done. Other options: Railway (`railway up`), Fly.io (`fly launch`), or a plain VPS behind nginx.

**Office LAN**
Run `npm start` on one machine and have everyone point their extension at `http://<that-machine's-LAN-ip>:3000`. Only works while everyone is on the same network / VPN.

Either way, share the `OFFICE_SECRET` with your team out-of-band (1Password, etc.) so they can paste it into the extension's settings popup.

---

## Distributing the Extension

| Option | Best for | How |
|--------|----------|-----|
| **Share a ZIP** | A few people, no IT involvement | Zip `extension/`, share, recipient drags into `chrome://extensions` with Developer mode on. The folder must stay in place — Chrome breaks if it's moved. |
| **Chrome Web Store (unlisted)** | 10+ people, want auto-updates | $5 one-time developer fee. Publish as **unlisted** so only people with the link can install. Push new versions without anyone reinstalling. |
| **Google Workspace force-install** | Companies on Workspace | Publish unlisted to the Web Store, then force-install via Google Admin Console → Devices → Chrome → Apps & Extensions. |

---

## Tuning the Humanizer

All rewriting behaviour lives in [backend/skills/SKILL.md](backend/skills/SKILL.md) — patterns to remove, vocabulary to strip, voice guidelines. Edit the file and restart the server. The extension never needs to be rebuilt or reinstalled when you change the prompt.

If you change SKILL.md frequently while iterating, run `npm run dev` so the server reloads automatically.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Floating button never appears | The selection must be ≥ 10 chars and inside an editable field (textarea, input, contenteditable, Google Docs editor). |
| `401 Unauthorized` from backend | The `Office Secret` in the extension settings doesn't match the server's `OFFICE_SECRET` env var. |
| Server exits with `⛔ OFFICE_SECRET is not set` | Add `OFFICE_SECRET=…` to `.env`. The server refuses to start without it by design. |
| `⛔ Could not read …/skills/SKILL.md` | Make sure [backend/skills/SKILL.md](backend/skills/SKILL.md) exists — the server loads it at startup. |
| `Invalid Anthropic API key` | Check `ANTHROPIC_API_KEY` in `.env` and restart. |
| `Rate limit reached` | You've hit Anthropic's rate limit. Wait, or upgrade your Anthropic plan. |
| `Text too long` | Selections over 8000 characters are rejected — humanize in chunks. |
| Extension stops working after a code change | Reload the extension at `chrome://extensions`, then reload the tab. The content script shows a toast prompting this when its context is invalidated. |
| CORS error in console | Strip any trailing slash from the Backend URL in settings. |

---

## Tech Stack

- **Extension**: vanilla JavaScript, Chrome Manifest V3, `chrome.storage.sync` for settings
- **Backend**: Node.js 18+, Express 4, `@anthropic-ai/sdk`, `dotenv`, `cors`
- **Model**: Claude Haiku 4.5 (`claude-haiku-4-5-20251001`) with ephemeral prompt caching
