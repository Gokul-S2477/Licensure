import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import pool from "./config/db.js";
import licenseExpiryJob from "./jobs/licenseExpiryJob.js";
import { sendTestMail } from "./services/notifications.js";

import peopleRoutes from "./routes/people.routes.js";
import licenseRoutes from "./routes/licenses.routes.js";
import mailLogsRoutes from "./routes/mailLogs.routes.js";
import messageTemplatesRoutes from "./routes/messageTemplates.routes.js";

dotenv.config();

const app = express();

/* -------------------- MIDDLEWARE -------------------- */
app.use(cors());
app.use(express.json());

/* -------------------- API ROUTES -------------------- */
app.use("/api/people", peopleRoutes);
app.use("/api/licenses", licenseRoutes);
app.use("/api/mail-logs", mailLogsRoutes);
app.use("/api/message-templates", messageTemplatesRoutes);

/* -------------------- BASIC ROUTES -------------------- */
app.get("/", (req, res) => {
  res.json({
    status: "OK",
    message: "License Management Backend is running",
    timestamp: new Date()
  });
});

app.get("/health", (req, res) => {
  res.status(200).json({
    status: "UP",
    uptime: process.uptime()
  });
});

app.get("/db-test", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");
    res.json({
      status: "DB Connected",
      time: result.rows[0]
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database connection failed" });
  }
});

/* -------------------- MANUAL CRON TEST -------------------- */
app.get("/cron-test", async (req, res) => {
  try {
    const { rows: licenses } = await pool.query(`
      SELECT * FROM licenses WHERE status = 'ACTIVE'
    `);

    let sentCount = 0;

    for (const license of licenses) {
      const daysLeft = Math.ceil(
        (new Date(license.expiry_date) - new Date()) / (1000 * 60 * 60 * 24)
      );

      const { rows: people } = await pool.query(
        `
        SELECT p.*, lp.responsibility
        FROM license_people lp
        JOIN people p ON p.id = lp.person_id
        WHERE lp.license_id = $1
        `,
        [license.id]
      );

      for (const person of people) {
        await pool.query(
          `
          INSERT INTO mail_logs
          (license_id, person_id, email, mail_type, subject, body, status, sent_at)
          VALUES ($1,$2,$3,$4,$5,$6,'SENT', NOW())
          `,
          [
            license.id,
            person.id,
            person.email,
            person.responsibility,
            `TEST: ${license.name} expiry`,
            `Expires in ${daysLeft} days`
          ]
        );

        sentCount++;
      }
    }

    res.json({
      status: "SUCCESS",
      mailsLogged: sentCount
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Cron test failed" });
  }
});

/* -------------------- MAIL TEST -------------------- */
app.get("/mail-test", async (req, res) => {
  try {
    const result = await sendTestMail();
    if (!result.ok) {
      return res.status(400).json({ error: result.error });
    }
    res.json({ status: "OK" });
  } catch (err) {
    console.error("MAIL TEST ERROR:", err);
    res.status(500).json({ error: "Mail test failed" });
  }
});

/* -------------------- SERVER START -------------------- */
const PORT = process.env.PORT || 5000;

licenseExpiryJob();

app.listen(PORT, () => {
  console.log(`🚀 Backend server running on port ${PORT}`);
});
