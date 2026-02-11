import nodemailer from "nodemailer";
import pool from "../config/db.js";

const daysBetween = (d1, d2) =>
  Math.ceil((new Date(d2) - new Date(d1)) / (1000 * 60 * 60 * 24));

const getTransporter = () => {
  if (!process.env.MAIL_USER || !process.env.MAIL_PASS) {
    return null;
  }

  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.MAIL_USER,
      pass: process.env.MAIL_PASS
    }
  });
};

const getErrMessage = (err, fallback) =>
  err?.response || err?.message || fallback;

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

let templatesReady = false;

const ensureTemplateStore = async () => {
  if (templatesReady) return;

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

  templatesReady = true;
};

const getMessageTemplates = async () => {
  try {
    await ensureTemplateStore();
    const { rows } = await pool.query("SELECT * FROM message_templates WHERE id = 1");
    if (rows.length === 0) return DEFAULT_TEMPLATES;
    return rows[0];
  } catch (err) {
    console.warn("Message template lookup failed, using defaults:", err.message);
    return DEFAULT_TEMPLATES;
  }
};

const renderTemplate = (template, values) =>
  String(template || "").replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key) => {
    if (values[key] === undefined || values[key] === null) return "";
    return String(values[key]);
  });

export const sendTestMail = async () => {
  const transporter = getTransporter();
  if (!transporter) {
    return { ok: false, error: "MAIL_USER/MAIL_PASS not set" };
  }

  try {
    await transporter.sendMail({
      from: `"License Bot" <${process.env.MAIL_USER}>`,
      to: process.env.MAIL_USER,
      subject: "Mail test from License Management System",
      text: "If you received this, SMTP auth is working."
    });
  } catch (err) {
    return { ok: false, error: getErrMessage(err, "Mail send failed") };
  }

  return { ok: true };
};

const buildMessage = (license, person, daysLeft, isResponsible, templates) => {
  const data = {
    person_name: person.name,
    person_email: person.email,
    license_name: license.name,
    provider: license.provider,
    expiry_date: license.expiry_date,
    issued_date: license.issued_date,
    start_date: license.start_date,
    days_left: daysLeft,
    role: isResponsible ? "RESPONSIBLE" : "STAKEHOLDER"
  };

  const subjectTemplate = isResponsible
    ? templates.responsible_subject
    : templates.stakeholder_subject;
  const bodyTemplate = isResponsible
    ? templates.responsible_body
    : templates.stakeholder_body;

  return {
    subject: renderTemplate(subjectTemplate, data),
    body: renderTemplate(bodyTemplate, data)
  };
};

const logMail = async (licenseId, person, mailType, subject, body, status) => {
  await pool.query(
    `
    INSERT INTO mail_logs
    (license_id, person_id, email, mail_type, subject, body, status, sent_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7, NOW())
    `,
    [
      licenseId,
      person.id,
      person.email,
      mailType,
      subject,
      body,
      status
    ]
  );
};

export const sendNotificationsForLicenseId = async (licenseId) => {
  const transporter = getTransporter();
  if (!transporter) {
    return { ok: false, error: "MAIL_USER/MAIL_PASS not set" };
  }

  const { rows: licenseRows } = await pool.query(
    "SELECT * FROM licenses WHERE id = $1",
    [licenseId]
  );
  if (licenseRows.length === 0) {
    return { ok: false, error: "License not found" };
  }

  const license = licenseRows[0];
  const daysLeft = daysBetween(new Date(), license.expiry_date);
  const templates = await getMessageTemplates();

  const { rows: recipients } = await pool.query(
    `
    SELECT p.*, lp.responsibility
    FROM license_people lp
    JOIN people p ON p.id = lp.person_id
    WHERE lp.license_id = $1
    `,
    [license.id]
  );
  if (recipients.length === 0) {
    return { ok: false, error: "No recipients linked to this license" };
  }

  let sent = 0;
  let failed = 0;
  let firstFailureReason = null;

  for (const person of recipients) {
    const isResponsible = person.responsibility === "RESPONSIBLE";
    const mailType = isResponsible ? "RESPONSIBLE" : "STAKEHOLDER";
    const { subject, body } = buildMessage(license, person, daysLeft, isResponsible, templates);

    try {
      await transporter.sendMail({
        from: `"License Bot" <${process.env.MAIL_USER}>`,
        to: person.email,
        subject,
        text: body
      });
      await logMail(license.id, person, mailType, subject, body, "SENT");
      sent++;
    } catch (err) {
      firstFailureReason = firstFailureReason || getErrMessage(err, "Mail send failed");
      await logMail(license.id, person, mailType, subject, body, "FAILED");
      failed++;
    }
  }

  if (sent === 0) {
    return {
      ok: false,
      error: firstFailureReason || "All notification sends failed",
      sent,
      failed,
      total: recipients.length
    };
  }

  return { ok: true, sent, failed, total: recipients.length };
};

export const sendNotificationsForLicense = async (license) => {
  const transporter = getTransporter();
  if (!transporter) {
    return { ok: false, error: "MAIL_USER/MAIL_PASS not set" };
  }

  const daysLeft = daysBetween(new Date(), license.expiry_date);
  const templates = await getMessageTemplates();

  const { rows: recipients } = await pool.query(
    `
    SELECT p.*, lp.responsibility
    FROM license_people lp
    JOIN people p ON p.id = lp.person_id
    WHERE lp.license_id = $1
    `,
    [license.id]
  );
  if (recipients.length === 0) {
    return { ok: false, error: "No recipients linked to this license" };
  }

  let sent = 0;
  let failed = 0;
  let firstFailureReason = null;

  for (const person of recipients) {
    const isResponsible = person.responsibility === "RESPONSIBLE";
    const mailType = isResponsible ? "RESPONSIBLE" : "STAKEHOLDER";
    const { subject, body } = buildMessage(license, person, daysLeft, isResponsible, templates);

    try {
      await transporter.sendMail({
        from: `"License Bot" <${process.env.MAIL_USER}>`,
        to: person.email,
        subject,
        text: body
      });
      await logMail(license.id, person, mailType, subject, body, "SENT");
      sent++;
    } catch (err) {
      firstFailureReason = firstFailureReason || getErrMessage(err, "Mail send failed");
      await logMail(license.id, person, mailType, subject, body, "FAILED");
      failed++;
    }
  }

  if (sent === 0) {
    return {
      ok: false,
      error: firstFailureReason || "All notification sends failed",
      sent,
      failed,
      total: recipients.length
    };
  }

  return { ok: true, sent, failed, total: recipients.length };
};
