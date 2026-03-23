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

// ── Load SKILL.md ──────────────────────────────────────────────────────────
const SKILL_PATH = path.join(__dirname, "skills", "SKILL.md");

let SYSTEM_PROMPT;
try {
  const raw = fs.readFileSync(SKILL_PATH, "utf-8");
  SYSTEM_PROMPT = raw.replace(/^---[\s\S]*?---\s*/m, "").trim();
  SYSTEM_PROMPT +=
    "\n\n## CRITICAL OUTPUT RULE\n" +
    "Return ONLY the final humanized text." +
    "No preamble, no explanation, no 'Here is the humanized version:', " +
    "no bullet points about what changed. " +
    "Just the rewritten text, ready to paste.";
  console.log(`✦ Loaded skill: ${SKILL_PATH}`);
} catch (err) {
  console.error(`\n⛔ Could not read ${SKILL_PATH}`);
  console.error("   Make sure the file exists at: backend/skills/SKILL.md\n");
  process.exit(1);
}

// ── Middleware ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: "50kb" }));

// CORS: open to all origins.
// The content script runs inside whatever site the user is on (Gmail, Docs,
// Notion, etc.) so the request origin is always that site's domain — we
// cannot whitelist every possible domain. Security comes from keeping the
// server on localhost / a private network, not from CORS restrictions.
app.use(cors());

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
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: `Please humanize the following text:\n\n${text}` }],
    });

    const humanized = message.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();

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
  console.log(`  GET  /health    — health check\n`);
});



