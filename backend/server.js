// ─── Humanizer Backend Server ────────────────────────────────────────────────
import express from "express";
import cors from "cors";
import Anthropic from "@anthropic-ai/sdk";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const OFFICE_SECRET = process.env.OFFICE_SECRET;

if (!OFFICE_SECRET) {
  console.error("\n⛔ OFFICE_SECRET is not set in .env");
  console.error("   Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"");
  console.error("   Then add it to .env as: OFFICE_SECRET=your-generated-secret\n");
  process.exit(1);
}

// ── Load SKILL.md ──────────────────────────────────────────────────────────
const SKILL_PATH = path.join(__dirname, "skills", "SKILL.md");

let SKILL_CONTENT;
try {
  const raw = fs.readFileSync(SKILL_PATH, "utf-8");
  SKILL_CONTENT = raw.replace(/^---[\s\S]*?---\s*/m, "").trim();
  console.log(`✦ Loaded skill: ${SKILL_PATH}`);
} catch (err) {
  console.error(`\n⛔ Could not read ${SKILL_PATH}`);
  console.error("   Make sure the file exists at: backend/skills/SKILL.md\n");
  process.exit(1);
}

// ── System prompt ──────────────────────────────────────────────────────────
const SYSTEM_PROMPT_TEXT = `${SKILL_CONTENT}

---

## ADDITIONAL RULES

Paragraph formatting: Use natural paragraph breaks. Do not club everything into one paragraph. Break into paragraphs the same way a human writer would — when the thought shifts, when a new point starts, or when a pause would feel natural.

Output: Return only the rewritten text. No preamble, no explanation, nothing before or after.`;

// ── Middleware ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: "50kb" }));
app.use(cors());

// ── Auth middleware — rejects any request without the correct secret ────────
app.use((req, res, next) => {
  // Skip auth for health check so Render's uptime monitoring still works
  if (req.path === "/health") return next();

  const secret = req.headers["x-office-secret"];
  if (!secret || secret !== OFFICE_SECRET) {
    return res.status(401).json({ error: "Unauthorized." });
  }
  next();
});

// ── Claude client ──────────────────────────────────────────────────────────
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── POST /humanize ─────────────────────────────────────────────────────────
app.post("/humanize", async (req, res) => {
  const { text } = req.body;

  if (!text || typeof text !== "string") {
    return res.status(400).json({ error: "Missing or invalid 'text' field." });
  }
  if (text.length > 8000) {
    return res.status(400).json({ error: "Text too long. Maximum 8000 characters." });
  }

  try {
    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT_TEXT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{
        role: "user",
        content: `Rewrite the following text to sound completely human-written. Remove every sign of AI writing. Use natural paragraph breaks — do not merge everything into one block.\n\n${text}`,
      }],
    });

    const humanized = message.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();

    const usage = message.usage;
    if (usage) {
      const cached = usage.cache_read_input_tokens || 0;
      const fresh  = usage.cache_creation_input_tokens || 0;
      if (cached > 0) {
        console.log(`✦ Cache HIT  — ${cached} tokens at 10% cost, ${usage.input_tokens} tokens full price`);
      } else if (fresh > 0) {
        console.log(`✦ Cache MISS — ${fresh} tokens written to cache (next request will be cheaper)`);
      }
    }

    return res.json({ humanized });
  } catch (err) {
    console.error("[Humanizer API Error]", err.message);
    if (err.status === 401) return res.status(500).json({ error: "Invalid Anthropic API key." });
    if (err.status === 429) return res.status(429).json({ error: "Rate limit reached. Try again shortly." });
    return res.status(500).json({ error: "Failed to humanize text." });
  }
});

// ── GET /health ────────────────────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "humanizer-backend" });
});

// ── Start ──────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n✦ Humanizer backend running at http://localhost:${PORT}`);
  console.log(`  POST /humanize  — main endpoint`);
  console.log(`  GET  /health    — health check`);
  console.log(`  Auth enabled    — requests require x-office-secret header\n`);
});