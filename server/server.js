import express from "express";
import cors from "cors";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_FILE = path.join(__dirname, "backups.json");

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

app.listen(8787, () => {
  // eslint-disable-next-line no-console
  console.log("Backup API running: http://localhost:8787");
});
