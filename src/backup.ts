import type { AppData, BackupRecord } from "./types";

const BACKUP_VERSION = "v1";

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function fromBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: toArrayBuffer(salt),
      iterations: 120000,
      hash: "SHA-256"
    },
    keyMaterial,
    {
      name: "AES-GCM",
      length: 256
    },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptAppData(data: AppData, passphrase: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(passphrase, salt);

  const plain = new TextEncoder().encode(JSON.stringify(data));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv: toArrayBuffer(iv) }, key, toArrayBuffer(plain));

  return JSON.stringify({
    version: BACKUP_VERSION,
    iv: toBase64(iv),
    salt: toBase64(salt),
    cipher: toBase64(new Uint8Array(cipher))
  });
}

export async function decryptAppData(payload: string, passphrase: string): Promise<AppData> {
  const parsed = JSON.parse(payload) as { version: string; iv: string; salt: string; cipher: string };
  const iv = fromBase64(parsed.iv);
  const salt = fromBase64(parsed.salt);
  const cipherBytes = fromBase64(parsed.cipher);
  const key = await deriveKey(passphrase, salt);

  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: toArrayBuffer(iv) },
    key,
    toArrayBuffer(cipherBytes)
  );
  const text = new TextDecoder().decode(plain);
  return JSON.parse(text) as AppData;
}

export async function backupToCloud(email: string, encryptedPayload: string): Promise<{ backupId: string; createdAt: string }> {
  const res = await fetch("/api/backup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      encryptedPayload,
      version: BACKUP_VERSION
    })
  });

  if (!res.ok) {
    throw new Error("备份失败");
  }

  return (await res.json()) as { backupId: string; createdAt: string };
}

export async function listCloudBackups(email: string): Promise<BackupRecord[]> {
  const res = await fetch(`/api/backup/list?email=${encodeURIComponent(email)}`);
  if (!res.ok) {
    throw new Error("获取备份列表失败");
  }
  const json = (await res.json()) as { records: BackupRecord[] };
  return json.records;
}

export async function restoreFromCloud(backupId: string): Promise<string> {
  const res = await fetch("/api/backup/restore", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ backupId })
  });

  if (!res.ok) {
    throw new Error("恢复失败");
  }

  const json = (await res.json()) as { encryptedPayload: string };
  return json.encryptedPayload;
}
