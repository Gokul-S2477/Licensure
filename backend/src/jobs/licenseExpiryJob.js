import cron from "node-cron";
import pool from "../config/db.js";
import { sendNotificationsForLicense } from "../services/notifications.js";
import { getAutoMailTrigger } from "../utils/autoMail.js";

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

let autoMailColumnState = null;

const getAutoMailColumnState = async () => {
  if (autoMailColumnState) return autoMailColumnState;
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

  autoMailColumnState = {
    notifySixMonth: await hasColumn("licenses", "notify_six_month"),
    notifyMonthly: await hasColumn("licenses", "notify_monthly"),
    notifyDailyLast30: await hasColumn("licenses", "notify_daily_last_30"),
    sixMonthSentAt: await hasColumn("licenses", "six_month_sent_at")
  };
  return autoMailColumnState;
};

// ---------------- CRON JOB ----------------
const licenseExpiryJob = () => {
  cron.schedule("0 9 * * *", async () => {
    console.log("Running License Expiry Cron Job");

    try {
      const columnState = await getAutoMailColumnState();
      const { rows: licenses } = await pool.query(`
        SELECT * FROM licenses
        WHERE status = 'ACTIVE'
      `);

      for (const license of licenses) {
        if (!columnState.notifySixMonth && !columnState.notifyMonthly && !columnState.notifyDailyLast30) {
          continue;
        }

        const trigger = getAutoMailTrigger(license);
        if (!trigger.shouldSend) continue;

        const result = await sendNotificationsForLicense(license);
        if (!result.ok) {
          console.warn("Mail not sent:", result.error, {
            reason: trigger.reason,
            licenseId: license.id
          });
          continue;
        }

        if (trigger.markSixMonthSent && columnState.sixMonthSentAt) {
          await pool.query("UPDATE licenses SET six_month_sent_at = NOW() WHERE id = $1", [
            license.id
          ]);
        }
      }
    } catch (err) {
      console.error("Cron Job Error:", err);
    }
  });
};

export default licenseExpiryJob;
