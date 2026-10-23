
const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");

const app = express();

app.use(helmet());
app.use(express.json({ limit: "15kb" }));

app.use(express.static(path.join(__dirname, "public")));

const reportLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false
});

app.post("/api/report", reportLimiter, async (req, res) => {
  const { username, category, details, evidence } = req.body || {};
  const webhook = process.env.DISCORD_WEBHOOK_URL;

  const categories = [
    "สมาชิกทำผิดกฎ",
    "การกลั่นแกล้งหรือคุกคาม",
    "ปัญหาบอทหรือระบบ",
    "ปัญหาอื่น ๆ"
  ];

  if (!webhook) {
    return res.status(500).json({
      error: "ระบบยังไม่ได้ตั้งค่า Discord"
    });
  }

  if (
    typeof username !== "string" ||
    username.trim().length < 2 ||
    username.length > 100 ||
    typeof category !== "string" ||
    !categories.includes(category) ||
    typeof details !== "string" ||
    details.trim().length < 10 ||
    details.length > 3000 ||
    (evidence !== undefined &&
      typeof evidence !== "string")
  ) {
    return res.status(400).json({
      error: "กรุณาตรวจสอบข้อมูลที่กรอก"
    });
  }

  let proof = "";

  if (evidence && evidence.trim()) {
    try {
      const url = new URL(evidence.trim());

      if (url.protocol !== "https:") throw new Error();

      proof = url.href.slice(0, 500);
    } catch {
      return res.status(400).json({
        error: "ลิงก์หลักฐานไม่ถูกต้อง"
      });
    }
  }

  try {
    const response = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
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
            ...(proof ? [{
              name: "หลักฐาน",
              value: proof
            }] : [])
          ],
          footer: { text: "Lumi Support ♡" },
          timestamp: new Date().toISOString()
        }]
      })
    });

    if (!response.ok) {
      console.error("Discord webhook returned:", response.status);
      throw new Error("Discord error");
    }

    return res.json({
      message: "ส่งรายงานสำเร็จแล้ว ♡"
    });
  } catch (error) {
    console.error("Report delivery failed:", error.message);

    return res.status(502).json({
      error: "ส่งรายงานไม่สำเร็จ กรุณาลองใหม่"
    });
  }
});

app.get("/health", (req, res) => {
  res.send("Lumi Support OK");
});

app.use((req, res) => {
  res.status(404).send("ไม่พบหน้าที่ต้องการ");
});

const port = process.env.PORT || 3000;

app.listen(port, "0.0.0.0", () => {
  console.log("Lumi Support started on port " + port);
});
