import express from "express";
import cors from "cors";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_FILE = path.join(__dirname, "backups.json");
const QQ_INBOX_FILE = path.join(__dirname, "qq_inbox.json");
const QQ_CONFIG_FILE = path.join(__dirname, "qq_config.json");
const QQ_WEBHOOK_TOKEN = process.env.QQ_WEBHOOK_TOKEN || "";

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

function loadDb() {
  if (!fs.existsSync(DATA_FILE)) {
    return { backups: [] };
  }
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
  } catch {
    return { backups: [] };
  }
}

function saveDb(db) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

function loadQqInbox() {
  if (!fs.existsSync(QQ_INBOX_FILE)) {
    return { items: [] };
  }
  try {
    return JSON.parse(fs.readFileSync(QQ_INBOX_FILE, "utf-8"));
  } catch {
    return { items: [] };
  }
}

function saveQqInbox(db) {
  fs.writeFileSync(QQ_INBOX_FILE, JSON.stringify(db, null, 2));
}

function loadQqConfig() {
  if (!fs.existsSync(QQ_CONFIG_FILE)) {
    return { token: "" };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(QQ_CONFIG_FILE, "utf-8"));
    return { token: String(parsed.token ?? "") };
  } catch {
    return { token: "" };
  }
}

function saveQqConfig(config) {
  fs.writeFileSync(QQ_CONFIG_FILE, JSON.stringify(config, null, 2));
}

app.post("/api/backup", (req, res) => {
  const { email, encryptedPayload, version } = req.body ?? {};
  if (!email || !encryptedPayload || !version) {
    return res.status(400).json({ error: "missing fields" });
  }

  const db = loadDb();
  const item = {
    id: `bk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    email,
    encryptedPayload,
    version,
    createdAt: new Date().toISOString(),
    size: Buffer.byteLength(encryptedPayload, "utf-8")
  };

  db.backups.push(item);

  const sameEmail = db.backups.filter((x) => x.email === email).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const keepSet = new Set(sameEmail.slice(0, 10).map((x) => x.id));
  db.backups = db.backups.filter((x) => x.email !== email || keepSet.has(x.id));

  saveDb(db);
  return res.json({ backupId: item.id, createdAt: item.createdAt });
});

app.get("/api/backup/list", (req, res) => {
  const email = String(req.query.email ?? "");
  if (!email) {
    return res.status(400).json({ error: "email required" });
  }

  const db = loadDb();
  const records = db.backups
    .filter((x) => x.email === email)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map((x) => ({
      id: x.id,
      email: x.email,
      version: x.version,
      createdAt: x.createdAt,
      size: x.size
    }));

  return res.json({ records });
});

app.post("/api/backup/restore", (req, res) => {
  const { backupId } = req.body ?? {};
  if (!backupId) {
    return res.status(400).json({ error: "backupId required" });
  }

  const db = loadDb();
  const item = db.backups.find((x) => x.id === backupId);
  if (!item) {
    return res.status(404).json({ error: "backup not found" });
  }

  return res.json({ encryptedPayload: item.encryptedPayload });
});

app.post("/api/collect/qq/message", (req, res) => {
  const savedConfig = loadQqConfig();
  const requiredToken = QQ_WEBHOOK_TOKEN || savedConfig.token;
  const token = String(req.headers["x-qq-token"] ?? req.body?.token ?? "");
  if (requiredToken && token !== requiredToken) {
    return res.status(401).json({ error: "invalid token" });
  }

  const text = String(req.body?.text ?? "").trim();
  const title = String(req.body?.title ?? "").trim() || text.slice(0, 20) || "QQ消息";
  const sender = String(req.body?.sender ?? "").trim();
  const qq = String(req.body?.qq ?? "").trim();
  const links = Array.isArray(req.body?.links)
    ? req.body.links.map((x) => String(x).trim()).filter(Boolean)
    : [];

  if (!text && links.length === 0) {
    return res.status(400).json({ error: "text or links required" });
  }

  const db = loadQqInbox();
  const item = {
    id: `qq_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    title,
    text,
    sender,
    qq,
    links,
    createdAt: new Date().toISOString(),
    consumed: false
  };
  db.items.unshift(item);
  saveQqInbox(db);
  return res.json({ ok: true, id: item.id });
});

app.get("/api/collect/qq/pull", (req, res) => {
  const take = Math.max(1, Math.min(100, Number(req.query.take ?? 50)));
  const db = loadQqInbox();
  const fresh = db.items.filter((x) => !x.consumed).slice(0, take);
  if (fresh.length > 0) {
    const idSet = new Set(fresh.map((x) => x.id));
    db.items = db.items.map((x) => (idSet.has(x.id) ? { ...x, consumed: true } : x));
    saveQqInbox(db);
  }
  return res.json({ items: fresh });
});

app.get("/api/collect/qq/config", (req, res) => {
  const savedConfig = loadQqConfig();
  const effectiveToken = QQ_WEBHOOK_TOKEN || savedConfig.token;
  return res.json({
    token: effectiveToken,
    fromEnv: Boolean(QQ_WEBHOOK_TOKEN)
  });
});

app.post("/api/collect/qq/config", (req, res) => {
  if (QQ_WEBHOOK_TOKEN) {
    return res.status(400).json({ error: "token locked by env QQ_WEBHOOK_TOKEN" });
  }
  const token = String(req.body?.token ?? "").trim();
  saveQqConfig({ token });
  return res.json({ ok: true });
});

app.listen(8787, () => {
  // eslint-disable-next-line no-console
  console.log("Backup API running: http://localhost:8787");
});
