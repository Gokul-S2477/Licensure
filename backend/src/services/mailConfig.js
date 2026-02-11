import crypto from "crypto";
import pool from "../config/db.js";

export const MODULE_PASSWORD = "licensure";

const ENC_ALGO = "aes-256-gcm";
const ENC_SALT = "licensure-mail-salt";
const ENC_KEY = crypto.scryptSync(MODULE_PASSWORD, ENC_SALT, 32);

let ensured = false;

const encrypt = (plainText) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ENC_ALGO, ENC_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(String(plainText), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
};

const decrypt = (payload) => {
  if (!payload) return "";
  const [ivB64, tagB64, dataB64] = String(payload).split(":");
  const decipher = crypto.createDecipheriv(
    ENC_ALGO,
    ENC_KEY,
    Buffer.from(ivB64, "base64")
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final()
  ]);
  return decrypted.toString("utf8");
};

export const verifyModulePassword = (value) => String(value || "") === MODULE_PASSWORD;

export const ensureSmtpSettingsStore = async () => {
  if (ensured) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS smtp_settings (
      id INTEGER PRIMARY KEY,
      sender_email TEXT,
      sender_password_enc TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(
    `
    INSERT INTO smtp_settings (id, sender_email, sender_password_enc, updated_at)
    VALUES (1, $1, $2, NOW())
    ON CONFLICT (id) DO NOTHING
    `,
    [
      process.env.MAIL_USER || null,
      process.env.MAIL_PASS ? encrypt(process.env.MAIL_PASS) : null
    ]
  );

  ensured = true;
};

export const getStoredSmtpRow = async () => {
  await ensureSmtpSettingsStore();
  const { rows } = await pool.query("SELECT * FROM smtp_settings WHERE id = 1");
  return rows[0] || null;
};

export const getSmtpCredentials = async () => {
  const row = await getStoredSmtpRow();
  const senderEmail = row?.sender_email || process.env.MAIL_USER || "";
  let senderPassword = process.env.MAIL_PASS || "";

  if (row?.sender_password_enc) {
    try {
      senderPassword = decrypt(row.sender_password_enc);
    } catch (err) {
      senderPassword = "";
    }
  }

  return { senderEmail, senderPassword };
};

export const saveSmtpSettings = async ({ senderEmail, senderPassword }) => {
  await ensureSmtpSettingsStore();
  await pool.query(
    `
    UPDATE smtp_settings
    SET sender_email = $1,
        sender_password_enc = $2,
        updated_at = NOW()
    WHERE id = 1
    `,
    [senderEmail || null, senderPassword ? encrypt(senderPassword) : null]
  );
  return getStoredSmtpRow();
};

export const getSmtpSettingsView = async () => {
  const row = await getStoredSmtpRow();
  return {
    sender_email: row?.sender_email || "",
    has_password: Boolean(row?.sender_password_enc),
    updated_at: row?.updated_at || null
  };
};
