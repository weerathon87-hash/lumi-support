

const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// ตั้งค่าความปลอดภัย
app.use(helmet());
app.use(express.json({ limit: "15kb" }));

// ตำแหน่งไฟล์หน้าเว็บไซต์
const publicFolder = path.join(__dirname, "public");
const homePage = path.join(__dirname, "index.html");

// เปิดไฟล์เว็บไซต์ที่อยู่ในโฟลเดอร์ public
app.use(express.static(publicFolder));

// เปิดหน้าแรกจาก index.html ในโฟลเดอร์หลัก
app.get("/", (req, res) => {
  res.sendFile(homePage, (error) => {
    if (error && !res.headersSent) {
      res.status(500).send(
        "ไม่สามารถเปิดหน้าเว็บได้ กรุณาตรวจสอบไฟล์ index.html"
      );
    }
  });
});

// ตรวจสอบสถานะเซิร์ฟเวอร์
app.get("/health", (req, res) => {
  res.status(200).send("Lumi Support OK");
});

// จำกัดจำนวนการส่งรายงาน
const reportLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false
});

// API รับรายงานและส่งเข้า Discord
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
    (evidence !== undefined && typeof evidence !== "string")
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
        throw new Error("Invalid evidence URL");
      }

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
      headers: {
        "Content-Type": "application/json"
      },
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
          footer: {
            text: "Lumi Support ♡"
          },
          timestamp: new Date().toISOString()
        }]
      })
    });

    if (!response.ok) {
      console.error("Discord error:", response.status);

      return res.status(502).json({
        error: "ส่งรายงานไม่สำเร็จ กรุณาลองใหม่"
      });
    }

    return res.json({
      message: "ส่งรายงานสำเร็จแล้ว ♡"
    });
  } catch (error) {
    console.error("ส่งรายงานผิดพลาด:", error.message);

    return res.status(502).json({
      error: "ไม่สามารถเชื่อมต่อ Discord ได้"
    });
  }
});

// หน้าที่ไม่มีอยู่
app.use((req, res) => {
  res.status(404).send("ไม่พบหน้าที่ต้องการ");
});

// เริ่มเซิร์ฟเวอร์
app.listen(PORT, "0.0.0.0", () => {
  console.log("Lumi Support started on port " + PORT);
});

