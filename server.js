
const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet());
app.use(express.json({ limit: "15kb" }));

const publicFolder = path.join(__dirname, "public");
const homePage = path.join(__dirname, "index.html");

app.use(express.static(publicFolder));

app.get("/", (req, res) => {
  res.sendFile(homePage, (error) => {
    if (error && !res.headersSent) {
      console.error("เปิด index.html ไม่สำเร็จ:", error.message);
      res.status(500).send("ไม่สามารถเปิดหน้าเว็บได้");
    }
  });
});

app.get("/health", (req, res) => {
  res.status(200).send("Lumi Support OK");
});

const reportLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    error: "ส่งรายงานบ่อยเกินไป กรุณารอสักครู่"
  }
});

const categories = [
  "สมาชิกทำผิดกฎ",
  "การกลั่นแกล้งหรือคุกคาม",
  "ปัญหาบอทหรือระบบ",
  "ปัญหาอื่น ๆ"
];

async function sendDiscordWebhook(webhook, payload) {
  let response;

  try {
    response = await fetch(webhook, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000)
    });
  } catch (error) {
    console.error("Discord connection error:", error.name, error.message);
    throw new Error("เชื่อมต่อ Discord ไม่สำเร็จ");
  }

  if (response.ok) {
    return;
  }

  const body = await response.text();

  // ไม่บันทึก Webhook URL ลง Logs
  console.error("Discord HTTP status:", response.status);
  console.error("Discord response:", body.slice(0, 1000));

  throw new Error(`Discord HTTP ${response.status}`);
}

app.post("/api/report", reportLimiter, async (req, res) => {
  console.log("ได้รับคำขอส่งรายงานแล้ว");

  const { username, category, details, evidence } = req.body || {};
  const webhook = process.env.DISCORD_WEBHOOK_URL;

  if (!webhook) {
    console.error("ไม่พบ DISCORD_WEBHOOK_URL ใน Environment");
    return res.status(500).json({
      error: "ระบบยังไม่ได้ตั้งค่า Discord"
    });
  }

  if (
    typeof username !== "string" ||
    username.trim().length < 2 ||
    username.trim().length > 100 ||
    typeof category !== "string" ||
    !categories.includes(category) ||
    typeof details !== "string" ||
    details.trim().length < 10 ||
    details.trim().length > 3000 ||
    (evidence !== undefined &&
      (typeof evidence !== "string" || evidence.length > 2000))
  ) {
    return res.status(400).json({
      error: "กรุณาตรวจสอบข้อมูลที่กรอก"
    });
  }

  let proof = "";

  if (evidence && evidence.trim()) {
    try {
      const url = new URL(evidence.trim());

      if (
        url.protocol !== "https:" ||
        !url.hostname ||
        url.username ||
        url.password
      ) {
        throw new Error("Invalid URL");
      }

      proof = url.href.slice(0, 500);
    } catch {
      return res.status(400).json({
        error: "ลิงก์หลักฐานไม่ถูกต้อง"
      });
    }
  }

  const payload = {
    allowed_mentions: { parse: [] },
    embeds: [{
      title: "📩 มีรายงานปัญหาใหม่",
      color: 0x8B72CF,
      description: details.trim(),
      fields: [
        {
          name: "ชื่อผู้แจ้ง",
          value: username.trim()
        },
        {
          name: "ประเภทปัญหา",
          value: category
        },
        ...(proof
          ? [{ name: "หลักฐาน", value: proof }]
          : [])
      ],
      footer: {
        text: "Lumi Support ♡"
      },
      timestamp: new Date().toISOString()
    }]
  };

  try {
    await sendDiscordWebhook(webhook, payload);

    console.log("ส่งรายงานไป Discord สำเร็จ");

    return res.status(200).json({
      message: "ส่งรายงานสำเร็จแล้ว ♡"
    });
  } catch (error) {
    console.error("ส่งรายงานผิดพลาด:", error.message);

    return res.status(502).json({
      error: "ส่งรายงานไม่สำเร็จ กรุณาลองใหม่ภายหลัง"
    });
  }
});

// จัดการ JSON ที่ส่งมาไม่ถูกต้อง
app.use((error, req, res, next) => {
  if (error instanceof SyntaxError && "body" in error) {
    return res.status(400).json({
      error: "รูปแบบข้อมูลไม่ถูกต้อง"
    });
  }

  console.error("Server error:", error.message);

  if (res.headersSent) {
    return next(error);
  }

  return res.status(500).json({
    error: "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์"
  });
});

app.use((req, res) => {
  res.status(404).send("ไม่พบหน้าที่ต้องการ");
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Lumi Support started on port ${PORT}`);
});
