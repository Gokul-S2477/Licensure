import express from "express";
import pool from "../config/db.js";

const router = express.Router();

const normalizeRole = (role) => {
  if (!role) return null;
  return String(role).trim().toUpperCase();
};

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

let peopleColumnsCache = null;

const getPeopleColumns = async () => {
  if (peopleColumnsCache) return peopleColumnsCache;
  const [role, type, designation, status] = await Promise.all([
    hasColumn("people", "role"),
    hasColumn("people", "type"),
    hasColumn("people", "designation"),
    hasColumn("people", "status")
  ]);
  peopleColumnsCache = { role, type, designation, status };
  return peopleColumnsCache;
};

/* GET all people */
router.get("/", async (req, res) => {
  try {
    const includeInactive = req.query.includeInactive === "true";
    const statusColumn = await hasColumn("people", "status");

    const { rows } = await pool.query(
      statusColumn && !includeInactive
        ? `
          SELECT *
          FROM people
          WHERE status IS NULL OR status <> 'INACTIVE'
          ORDER BY created_at DESC
          `
        : `
          SELECT *
          FROM people
          ORDER BY created_at DESC
          `
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch people" });
  }
});

/* GET person by id */
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const statusColumn = await hasColumn("people", "status");
    const { rows } = await pool.query(
      "SELECT * FROM people WHERE id = $1",
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: "Person not found" });
    }
    if (statusColumn && rows[0].status === "INACTIVE") {
      return res.status(404).json({ error: "Person not found" });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch person" });
  }
});

/* CREATE person */
router.post("/", async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      department,
      role,
      designation
    } = req.body;

    const normalizedRole = normalizeRole(role);
    const columns = await getPeopleColumns();

    // Basic validation
    if (!name || !email || !phone || !department || !normalizedRole) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Stakeholder must have designation
    if (columns.designation && normalizedRole === "STAKEHOLDER" && !designation) {
      return res.status(400).json({ error: "Designation required for stakeholder" });
    }

    if (!columns.role && !columns.type) {
      return res.status(500).json({ error: "People table missing role/type column" });
    }

    const { rows: existingByEmail } = await pool.query(
      "SELECT * FROM people WHERE LOWER(email) = LOWER($1) LIMIT 1",
      [email]
    );

    if (existingByEmail.length > 0) {
      const existing = existingByEmail[0];
      const existingIsInactive = columns.status && existing.status === "INACTIVE";

      if (!existingIsInactive) {
        return res.status(409).json({ error: "Person with this email already exists" });
      }

      const sets = [
        "name = $1",
        "email = $2",
        "phone = $3",
        "department = $4"
      ];
      const updateValues = [name, email, phone, department];

      if (columns.role) {
        sets.push(`role = $${updateValues.length + 1}`);
        updateValues.push(normalizedRole);
      }
      if (columns.type) {
        sets.push(`type = $${updateValues.length + 1}`);
        updateValues.push(normalizedRole);
      }
      if (columns.designation) {
        sets.push(`designation = $${updateValues.length + 1}`);
        updateValues.push(designation || null);
      }
      if (columns.status) {
        sets.push(`status = $${updateValues.length + 1}`);
        updateValues.push("ACTIVE");
      }

      updateValues.push(existing.id);
      const { rows } = await pool.query(
        `
        UPDATE people
        SET ${sets.join(",\n            ")}
        WHERE id = $${updateValues.length}
        RETURNING *
        `,
        updateValues
      );

      return res.status(201).json(rows[0]);
    }

    const insertColumns = ["name", "email", "phone", "department"];
    const insertValues = [name, email, phone, department];

    if (columns.role) {
      insertColumns.push("role");
      insertValues.push(normalizedRole);
    }
    if (columns.type) {
      insertColumns.push("type");
      insertValues.push(normalizedRole);
    }
    if (columns.designation) {
      insertColumns.push("designation");
      insertValues.push(designation || null);
    }

    const placeholders = insertColumns.map((_, i) => `$${i + 1}`).join(",");
    const { rows } = await pool.query(
      `
      INSERT INTO people
      (${insertColumns.join(",")})
      VALUES (${placeholders})
      RETURNING *
      `,
      insertValues
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error("CREATE PERSON ERROR:", err);
    if (err.code === "23505") {
      return res.status(409).json({ error: "Person already exists (duplicate unique value)" });
    }
    res.status(500).json({ error: "Failed to create person" });
  }
});

/* UPDATE person */
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      email,
      phone,
      department,
      role,
      designation
    } = req.body;

    const { rows: existingRows } = await pool.query(
      "SELECT * FROM people WHERE id = $1",
      [id]
    );
    if (existingRows.length === 0) {
      return res.status(404).json({ error: "Person not found" });
    }

    const existing = existingRows[0];
    const columns = await getPeopleColumns();
    const currentRole = existing.role ?? existing.type ?? null;
    const normalizedRole = normalizeRole(role) || currentRole;
    const nextDesignation = designation !== undefined ? designation : existing.designation;

    if (!name && !email && !phone && !department && !role && designation === undefined) {
      return res.status(400).json({ error: "No fields provided for update" });
    }

    if (columns.designation && normalizedRole === "STAKEHOLDER" && !nextDesignation) {
      return res.status(400).json({ error: "Designation required for stakeholder" });
    }

    const sets = [
      "name = $1",
      "email = $2",
      "phone = $3",
      "department = $4"
    ];
    const updateValues = [
      name ?? existing.name,
      email ?? existing.email,
      phone ?? existing.phone,
      department ?? existing.department
    ];

    if (columns.role) {
      sets.push(`role = $${updateValues.length + 1}`);
      updateValues.push(normalizedRole);
    }
    if (columns.type) {
      sets.push(`type = $${updateValues.length + 1}`);
      updateValues.push(normalizedRole);
    }
    if (columns.designation) {
      sets.push(`designation = $${updateValues.length + 1}`);
      updateValues.push(nextDesignation ?? null);
    }

    updateValues.push(id);
    const { rows } = await pool.query(
      `
      UPDATE people
      SET ${sets.join(",\n          ")}
      WHERE id = $${updateValues.length}
      RETURNING *
      `,
      updateValues
    );

    res.json(rows[0]);
  } catch (err) {
    console.error("UPDATE PERSON ERROR:", err);
    if (err.code === "23505") {
      return res.status(409).json({ error: "Person already exists (duplicate unique value)" });
    }
    res.status(500).json({ error: "Failed to update person" });
  }
});

/* DELETE person */
router.delete("/:id", async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;

    await client.query("BEGIN");
    await client.query("DELETE FROM license_people WHERE person_id = $1", [id]);
    const result = await client.query("DELETE FROM people WHERE id = $1", [id]);
    await client.query("COMMIT");

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Person not found" });
    }

    res.json({ ok: true, deleted: true });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("DELETE PERSON ERROR:", err);
    res.status(500).json({ error: "Failed to delete person" });
  } finally {
    client.release();
  }
});

export default router;
