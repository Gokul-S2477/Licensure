import express from "express";
import {
  getSmtpSettingsView,
  saveSmtpSettings,
  verifyModulePassword
} from "../services/mailConfig.js";

const router = express.Router();

const passwordFromRequest = (req) =>
  req.headers["x-module-password"] || req.query.module_password || req.body?.module_password;

router.get("/", async (req, res) => {
  try {
    if (!verifyModulePassword(passwordFromRequest(req))) {
      return res.status(401).json({ error: "Invalid module password" });
    }
    const data = await getSmtpSettingsView();
    res.json(data);
  } catch (err) {
    console.error("GET SMTP SETTINGS ERROR:", err);
    res.status(500).json({ error: "Failed to load SMTP settings" });
  }
});

router.put("/", async (req, res) => {
  try {
    const { module_password, sender_email, sender_password } = req.body || {};
    if (!verifyModulePassword(module_password)) {
      return res.status(401).json({ error: "Invalid module password" });
    }

    if (!sender_email || !sender_password) {
      return res.status(400).json({ error: "Sender email and password are required" });
    }

    await saveSmtpSettings({
      senderEmail: String(sender_email).trim(),
      senderPassword: String(sender_password)
    });

    const data = await getSmtpSettingsView();
    res.json(data);
  } catch (err) {
    console.error("UPDATE SMTP SETTINGS ERROR:", err);
    res.status(500).json({ error: "Failed to save SMTP settings" });
  }
});

export default router;
