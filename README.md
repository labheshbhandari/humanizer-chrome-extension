# ✦ Humanize AI Text — Chrome Extension

> Select any AI-generated text on any website → click **✦ Humanize** → text is replaced instantly.

---

## What This Is

A two-part tool:

| Part | What it does |
|------|-------------|
| **Chrome Extension** | Detects text selections in editable fields and shows a floating "Humanize" button |
| **Backend Server** | Receives the text, calls the Claude API with your SKILL.md humanizer prompt, returns the result |

---

## Project Structure

```
humanizer-extension/
├── extension/              ← Load this folder into Chrome
│   ├── manifest.json
│   ├── content.js          ← Runs on every page, handles selection & replacement
│   ├── popup.css           ← Styles for the floating button & toast
│   ├── background.js       ← Service worker
│   ├── settings.html       ← Extension settings popup
│   ├── settings.js
│   └── icons/
│       ├── icon16.png
│       ├── icon48.png
│       └── icon128.png
└── backend/                ← Node.js server your team runs
    ├── server.js
    ├── package.json
    └── .env.example
```

---

## Step 1 — Run the Backend

### Prerequisites
- Node.js 18 or higher
- An Anthropic API key → https://console.anthropic.com

### Setup

```bash
cd backend
npm install
cp .env.example .env
```

Edit `.env`:
```
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxx
PORT=3000
```

### Start the server

```bash
npm start
```

You should see:
```
✦ Humanizer backend running at http://localhost:3000
```

### For the whole office (recommended)

Deploy the backend on your internal network or a cloud server so everyone can use the same one. Options:

**Option A — Internal network (LAN)**
Run the server on one machine in the office. Everyone sets the backend URL to `http://192.168.x.x:3000` (use that machine's local IP). Works as long as everyone is on the same network / VPN.

**Option B — Cloud server (best for remote teams)**
Deploy to any Node.js host:
- **Railway** — `railway up` (free tier available)
- **Render** — connect GitHub repo, one-click deploy
- **Fly.io** — `fly launch`
- **Your own server** — `npm start` behind nginx

Everyone then sets the backend URL to your cloud server's address (e.g. `https://humanizer.yourcompany.com`).

> ⚠️ If deploying publicly, add an `OFFICE_SECRET` env variable and check it in the request headers to prevent abuse. See the "Security" section below.

---

## Step 2 — Install the Extension

### For yourself (developer mode)

1. Open Chrome → go to `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `extension/` folder
5. The ✦ icon appears in your toolbar

### For the whole office (two options)

#### Option A — Share a ZIP (easiest, no IT required)

1. Zip the `extension/` folder → `humanizer-extension.zip`
2. Share it in Slack / email
3. Each person:
   - Unzips to a permanent folder (e.g. `Documents/humanizer-extension`)
   - Goes to `chrome://extensions` → Developer mode ON → Load unpacked → selects that folder
   - Clicks the ✦ icon → sets the Backend URL → Save

> ⚠️ The folder must stay in place. If they move it, Chrome will break the extension.

#### Option B — Publish to Chrome Web Store (cleanest, recommended for 10+ people)

1. Zip the `extension/` folder
2. Go to https://chrome.google.com/webstore/devconsole
3. Pay the one-time $5 developer fee
4. Upload the zip, fill in the listing details
5. Publish as **unlisted** (only people with the link can install it)
6. Share the install link with your office in Slack

This means automatic updates when you push new versions — no reinstalling needed.

#### Option C — Google Workspace Admin (for Google Workspace offices)

If your company uses Google Workspace:
1. Publish the extension to the Chrome Web Store (unlisted)
2. Go to **Google Admin Console** → Devices → Chrome → Apps & Extensions
3. Force-install the extension for everyone in the org automatically

---

## Step 3 — Configure the Extension

1. Click the **✦** icon in Chrome's toolbar
2. Set **Backend URL** to your server address:
   - Local: `http://localhost:3000`
   - Office LAN: `http://192.168.1.50:3000`
   - Cloud: `https://humanizer.yourcompany.com`
3. Click **Save Settings**

---

## How to Use

1. Go to Gmail, Notion, Outlook Web, or any site with a text field
2. Paste or type some text into the text box
3. **Select** the AI-generated text with your mouse
4. A floating **✦ Humanize** button appears above the selection
5. Click it — the text is replaced with the humanized version

---

## Security (for cloud deployments)

Add a shared secret so only your team can use the backend:

**In `.env`:**
```
OFFICE_SECRET=your-secret-key-here
```

**In `server.js`**, add this check inside the `/humanize` route:
```js
const secret = req.headers["x-office-secret"];
if (secret !== process.env.OFFICE_SECRET) {
  return res.status(401).json({ error: "Unauthorized" });
}
```

**In `content.js`**, add the header to the fetch call:
```js
headers: {
  "Content-Type": "application/json",
  "x-office-secret": "your-secret-key-here"
}
```

---

## Updating the Humanizer Prompt

The humanizer instructions live in `backend/server.js` as the `SYSTEM_PROMPT` constant. Edit it any time to tune the behavior. The extension itself never needs to be reinstalled — only the backend server needs a restart.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Button doesn't appear | Make sure you're clicking inside an editable field (email compose, text box, etc.) |
| "Something went wrong" | Check that the backend server is running and the URL in settings is correct |
| Text not replaced in Gmail | Gmail uses contentEditable divs — this is supported. Try clicking directly in the compose box first |
| CORS error in console | Make sure you're using the correct backend URL (no trailing slash) |
| API key error | Check your `.env` file and restart the server |
