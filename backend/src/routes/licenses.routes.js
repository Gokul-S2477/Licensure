import express from "express";
import pool from "../config/db.js";
import { sendNotificationsForLicenseId } from "../services/notifications.js";
import { shouldSendImmediateSixMonth, toBool } from "../utils/autoMail.js";

const router = express.Router();

const hasColumn = async (table, column) => {
  const { rows } = await pool.query(
    `
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = $1
      AND column_name = $2
    `,
    [table, column]
  );
  return rows.length > 0;
};

let autoMailColumnsCache = null;
let licenseBaseColumnsCache = null;

const getAutoMailColumns = async () => {
  if (autoMailColumnsCache) return autoMailColumnsCache;

  try {
    await pool.query(`
      ALTER TABLE licenses
      ADD COLUMN IF NOT EXISTS notify_six_month BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS notify_monthly BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS notify_daily_last_30 BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS six_month_sent_at TIMESTAMPTZ
    `);
  } catch (err) {
    console.warn("Could not auto-migrate licenses auto-mail columns:", err.message);
  }

  const [notifySixMonth, notifyMonthly, notifyDailyLast30, sixMonthSentAt] = await Promise.all([
    hasColumn("licenses", "notify_six_month"),
    hasColumn("licenses", "notify_monthly"),
    hasColumn("licenses", "notify_daily_last_30"),
    hasColumn("licenses", "six_month_sent_at")
  ]);

  autoMailColumnsCache = {
    notifySixMonth,
    notifyMonthly,
    notifyDailyLast30,
    sixMonthSentAt
  };
  return autoMailColumnsCache;
};

const getLicenseBaseColumns = async () => {
  if (licenseBaseColumnsCache) return licenseBaseColumnsCache;
  const [status, startDate, description] = await Promise.all([
    hasColumn("licenses", "status"),
    hasColumn("licenses", "start_date"),
    hasColumn("licenses", "description")
  ]);
  licenseBaseColumnsCache = { status, startDate, description };
  return licenseBaseColumnsCache;
};

/* GET all licenses */
router.get("/", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT *
      FROM licenses
      ORDER BY expiry_date ASC
    `);

    // attach people relations
    for (const l of rows) {
      const { rows: rels } = await pool.query(
        `
        SELECT person_id, responsibility
        FROM license_people
        WHERE license_id = $1
      `,
        [l.id]
      );

      l.responsibleIds = rels
        .filter((r) => r.responsibility === "RESPONSIBLE")
        .map((r) => r.person_id);
      l.stakeholderIds = rels
        .filter((r) => r.responsibility === "STAKEHOLDER")
        .map((r) => r.person_id);
    }

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch licenses" });
  }
});

/* CREATE license */
router.post("/", async (req, res) => {
  const client = await pool.connect();
  try {
    const {
      name,
      provider,
      cost,
      issued_date,
      start_date,
      expiry_date,
      status,
      description,
      notify_six_month,
      notify_monthly,
      notify_daily_last_30,
      responsibleIds = [],
      stakeholderIds = []
    } = req.body;

    if (!name || !provider || !issued_date || !expiry_date) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const autoMailColumns = await getAutoMailColumns();
    const baseColumns = await getLicenseBaseColumns();
    await client.query("BEGIN");

    const columns = [
      "name",
      "provider",
      "cost",
      "issued_date",
      "expiry_date"
    ];
    const values = [
      name,
      provider,
      cost,
      issued_date,
      expiry_date
    ];

    if (baseColumns.startDate) {
      columns.push("start_date");
      values.push(start_date ?? null);
    }
    if (baseColumns.status) {
      columns.push("status");
      values.push(status || "ACTIVE");
    }
    if (baseColumns.description) {
      columns.push("description");
      values.push(description ?? null);
    }

    if (autoMailColumns.notifySixMonth) {
      columns.push("notify_six_month");
      values.push(toBool(notify_six_month));
    }
    if (autoMailColumns.notifyMonthly) {
      columns.push("notify_monthly");
      values.push(toBool(notify_monthly));
    }
    if (autoMailColumns.notifyDailyLast30) {
      columns.push("notify_daily_last_30");
      values.push(toBool(notify_daily_last_30));
    }

    const placeholders = columns.map((_, i) => `$${i + 1}`).join(",");
    const { rows } = await client.query(
      `
      INSERT INTO licenses
      (${columns.join(",")})
      VALUES (${placeholders})
      RETURNING *
      `,
      values
    );

    const licenseId = rows[0].id;

    // RESPONSIBLES
    for (const pid of responsibleIds) {
      await client.query(
        `
        INSERT INTO license_people (license_id, person_id, responsibility)
        VALUES ($1,$2,'RESPONSIBLE')
        `,
        [licenseId, pid]
      );
    }

    // STAKEHOLDERS
    for (const pid of stakeholderIds) {
      await client.query(
        `
        INSERT INTO license_people (license_id, person_id, responsibility)
        VALUES ($1,$2,'STAKEHOLDER')
        `,
        [licenseId, pid]
      );
    }

    await client.query("COMMIT");

    if (autoMailColumns.notifySixMonth && shouldSendImmediateSixMonth(rows[0])) {
      try {
        const mailResult = await sendNotificationsForLicenseId(rows[0].id);
        if (!mailResult.ok) {
          console.warn("Immediate six-month notification failed:", mailResult.error, {
            licenseId: rows[0].id
          });
        } else if (autoMailColumns.sixMonthSentAt) {
          await pool.query("UPDATE licenses SET six_month_sent_at = NOW() WHERE id = $1", [
            rows[0].id
          ]);
        }
      } catch (err) {
        console.warn("Immediate six-month notification crashed:", err.message, {
          licenseId: rows[0].id
        });
      }
    }

    res.status(201).json(rows[0]);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("CREATE LICENSE ERROR:", err);
    if (err.code === "23503") {
      return res.status(400).json({ error: "Invalid responsible/stakeholder selection" });
    }
    if (err.code === "23505") {
      return res.status(409).json({ error: "License already exists (duplicate unique value)" });
    }
    res.status(500).json({ error: err.message || "Failed to create license" });
  } finally {
    client.release();
  }
});

/* UPDATE license */
router.put("/:id", async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const {
      name,
      provider,
      cost,
      issued_date,
      start_date,
      expiry_date,
      status,
      description,
      notify_six_month,
      notify_monthly,
      notify_daily_last_30,
      responsibleIds = [],
      stakeholderIds = []
    } = req.body;

    const { rows: existingRows } = await client.query("SELECT * FROM licenses WHERE id = $1", [
      id
    ]);
    if (existingRows.length === 0) {
      return res.status(404).json({ error: "License not found" });
    }

    const existing = existingRows[0];
    const clean = (v) =>
      v === undefined || v === null || (typeof v === "string" && v.trim() === "") ? null : v;
    const nextName = clean(name) ?? existing.name;
    const nextProvider = clean(provider) ?? existing.provider;
    const nextCost = clean(cost);
    const nextIssued = clean(issued_date) ?? existing.issued_date;
    const nextStart = clean(start_date) ?? existing.start_date;
    const nextExpiry = clean(expiry_date) ?? existing.expiry_date;
    const nextStatus = clean(status) ?? existing.status;
    const nextDesc = clean(description) ?? existing.description;
    const autoMailColumns = await getAutoMailColumns();
    const nextNotifySixMonth =
      notify_six_month !== undefined ? toBool(notify_six_month) : toBool(existing.notify_six_month);
    const nextNotifyMonthly =
      notify_monthly !== undefined ? toBool(notify_monthly) : toBool(existing.notify_monthly);
    const nextNotifyDailyLast30 =
      notify_daily_last_30 !== undefined
        ? toBool(notify_daily_last_30)
        : toBool(existing.notify_daily_last_30);

    const baseColumns = await getLicenseBaseColumns();
    await client.query("BEGIN");

    const sets = ["name = $1", "provider = $2", "cost = $3", "issued_date = $4", "expiry_date = $5"];
    const updateValues = [
      nextName,
      nextProvider,
      nextCost ?? existing.cost,
      nextIssued,
      nextExpiry
    ];

    if (baseColumns.startDate) {
      sets.push(`start_date = $${updateValues.length + 1}`);
      updateValues.push(nextStart);
    }
    if (baseColumns.status) {
      sets.push(`status = $${updateValues.length + 1}`);
      updateValues.push(nextStatus);
    }
    if (baseColumns.description) {
      sets.push(`description = $${updateValues.length + 1}`);
      updateValues.push(nextDesc);
    }

    if (autoMailColumns.notifySixMonth) {
      sets.push(`notify_six_month = $${updateValues.length + 1}`);
      updateValues.push(nextNotifySixMonth);
    }
    if (autoMailColumns.notifyMonthly) {
      sets.push(`notify_monthly = $${updateValues.length + 1}`);
      updateValues.push(nextNotifyMonthly);
    }
    if (autoMailColumns.notifyDailyLast30) {
      sets.push(`notify_daily_last_30 = $${updateValues.length + 1}`);
      updateValues.push(nextNotifyDailyLast30);
    }
    if (autoMailColumns.sixMonthSentAt && notify_six_month !== undefined && toBool(notify_six_month)) {
      sets.push("six_month_sent_at = NULL");
    }

    updateValues.push(id);
    const { rows } = await client.query(
      `
      UPDATE licenses
      SET ${sets.join(",\n          ")}
      WHERE id = $${updateValues.length}
      RETURNING *
      `,
      updateValues
    );

    // Replace people relations
    await client.query("DELETE FROM license_people WHERE license_id = $1", [id]);

    for (const pid of responsibleIds) {
      await client.query(
        `
        INSERT INTO license_people (license_id, person_id, responsibility)
        VALUES ($1,$2,'RESPONSIBLE')
        `,
        [id, pid]
      );
    }

    for (const pid of stakeholderIds) {
      await client.query(
        `
        INSERT INTO license_people (license_id, person_id, responsibility)
        VALUES ($1,$2,'STAKEHOLDER')
        `,
        [id, pid]
      );
    }

    await client.query("COMMIT");

    if (autoMailColumns.notifySixMonth && shouldSendImmediateSixMonth(rows[0])) {
      try {
        const mailResult = await sendNotificationsForLicenseId(rows[0].id);
        if (!mailResult.ok) {
          console.warn("Immediate six-month notification failed on update:", mailResult.error, {
            licenseId: rows[0].id
          });
        } else if (autoMailColumns.sixMonthSentAt) {
          await pool.query("UPDATE licenses SET six_month_sent_at = NOW() WHERE id = $1", [
            rows[0].id
          ]);
        }
      } catch (err) {
        console.warn("Immediate six-month notification crashed on update:", err.message, {
          licenseId: rows[0].id
        });
      }
    }

    res.json(rows[0]);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("UPDATE LICENSE ERROR:", err);
    if (err.code === "23503") {
      return res.status(400).json({ error: "Invalid responsible/stakeholder selection" });
    }
    if (err.code === "23505") {
      return res.status(409).json({ error: "License already exists (duplicate unique value)" });
    }
    res.status(500).json({ error: err.message || "Failed to update license" });
  } finally {
    client.release();
  }
});

/* DELETE license */
router.delete("/:id", async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;

    await client.query("BEGIN");
    await client.query("DELETE FROM license_people WHERE license_id = $1", [id]);
    const result = await client.query("DELETE FROM licenses WHERE id = $1", [id]);
    await client.query("COMMIT");

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "License not found" });
    }

    res.json({ ok: true, deleted: true });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("DELETE LICENSE ERROR:", err);
    res.status(500).json({ error: "Failed to delete license" });
  } finally {
    client.release();
  }
});

/* MANUAL notify */
router.post("/:id/notify", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await sendNotificationsForLicenseId(id);
    if (!result.ok) {
      return res.status(400).json({ error: result.error });
    }
    res.json(result);
  } catch (err) {
    console.error("MANUAL NOTIFY ERROR:", err);
    res.status(500).json({ error: err.message || "Failed to send notifications" });
  }
});

export default router;
