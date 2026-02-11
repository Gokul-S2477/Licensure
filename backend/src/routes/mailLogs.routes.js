import express from "express";
import pool from "../config/db.js";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        ml.*,
        l.name AS license_name,
        p.name AS person_name
      FROM mail_logs ml
      LEFT JOIN licenses l ON l.id = ml.license_id
      LEFT JOIN people p ON p.id = ml.person_id
      ORDER BY ml.sent_at DESC NULLS LAST, ml.id DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch mail logs" });
  }
});

export default router;
