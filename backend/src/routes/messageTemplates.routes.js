import express from "express";
import pool from "../config/db.js";

const router = express.Router();

const DEFAULT_TEMPLATES = {
  responsible_subject: "ACTION REQUIRED: {{license_name}} expires in {{days_left}} days",
  responsible_body: `Dear {{person_name}},

You are the PRIMARY RESPONSIBLE for the license "{{license_name}}".

Expiry Date: {{expiry_date}}
Days Remaining: {{days_left}}

Please initiate renewal immediately.

-- License Management System`,
  stakeholder_subject: "INFO: {{license_name}} expiry update ({{days_left}} days left)",
  stakeholder_body: `Dear {{person_name}},

This is an informational update for the license "{{license_name}}".

Expiry Date: {{expiry_date}}
Days Remaining: {{days_left}}

No action required from you.

-- License Management System`
};

let initialized = false;

const ensureTemplateStore = async () => {
  if (initialized) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS message_templates (
      id INTEGER PRIMARY KEY,
      responsible_subject TEXT NOT NULL,
      responsible_body TEXT NOT NULL,
      stakeholder_subject TEXT NOT NULL,
      stakeholder_body TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(
    `
    INSERT INTO message_templates
      (id, responsible_subject, responsible_body, stakeholder_subject, stakeholder_body, updated_at)
    VALUES (1, $1, $2, $3, $4, NOW())
    ON CONFLICT (id) DO NOTHING
    `,
    [
      DEFAULT_TEMPLATES.responsible_subject,
      DEFAULT_TEMPLATES.responsible_body,
      DEFAULT_TEMPLATES.stakeholder_subject,
      DEFAULT_TEMPLATES.stakeholder_body
    ]
  );

  initialized = true;
};

router.get("/", async (req, res) => {
  try {
    await ensureTemplateStore();
    const { rows } = await pool.query("SELECT * FROM message_templates WHERE id = 1");
    res.json(rows[0]);
  } catch (err) {
    console.error("GET MESSAGE TEMPLATES ERROR:", err);
    res.status(500).json({ error: "Failed to fetch message templates" });
  }
});

router.put("/", async (req, res) => {
  try {
    await ensureTemplateStore();
    const {
      responsible_subject,
      responsible_body,
      stakeholder_subject,
      stakeholder_body
    } = req.body;

    if (!responsible_subject || !responsible_body || !stakeholder_subject || !stakeholder_body) {
      return res.status(400).json({ error: "All template fields are required" });
    }

    const { rows } = await pool.query(
      `
      UPDATE message_templates
      SET responsible_subject = $1,
          responsible_body = $2,
          stakeholder_subject = $3,
          stakeholder_body = $4,
          updated_at = NOW()
      WHERE id = 1
      RETURNING *
      `,
      [responsible_subject, responsible_body, stakeholder_subject, stakeholder_body]
    );

    res.json(rows[0]);
  } catch (err) {
    console.error("UPDATE MESSAGE TEMPLATES ERROR:", err);
    res.status(500).json({ error: "Failed to update message templates" });
  }
});

export default router;
