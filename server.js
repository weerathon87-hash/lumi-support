
const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// ตั้งค่าความปลอดภัย
app.use(helmet());
app.use(express.json({ limit: "15kb" }));

// ตำแหน่งไฟล์เว็บไซต์
const publicFolder = path.join(__dirname, "public");
const homePage = path.join(__dirname, "index.html");

// เปิดเว็บไซต์
app.use(express.static(publicFolder));

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

// รอเวลาตามที่กำหนด
const sleep = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

// ส่งรายงานเข้า Discord พร้อมจัดการ Error 429
async function sendDiscordWebhook(webhook, payload) {
  const maxRetries = 3;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(webhook, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000)
    });

    // ส่งสำเร็จ
    if (response.ok) {
      return;
    }

    // อ่านรายละเอียด Error
    const body = await response.text();

    // ถ้าไม่ใช่ 429 หรือหมดจำนวนครั้งที่ลองแล้ว
    if (response.status !== 429 || attempt === maxRetries) {
      console.error("Discord HTTP:", response.status);
      throw new Error(`Discord HTTP ${response.status}`);
    }

    // อ่านเวลาที่ Discord ให้รอ
    let retryAfter = Number(
      response.headers.get("Retry-After")
    );

    try {
      const data = JSON.parse(body);

      if (Number.isFinite(data.retry_after)) {
        retryAfter = data.retry_after;
      }
    } catch {
      // ใช้ค่า Retry-After จาก response header
    }

    if (!Number.isFinite(retryAfter) || retryAfter < 0) {
      throw new Error("ไม่พบเวลารอจาก Discord");
    }

    // ถ้าต้องรอนาน ให้หยุดก่อน ไม่ส่งซ้ำ
    if (retryAfter > 30) {
      throw new Error(
        `Discord ขอให้รอ ${retryAfter} วินาที`
      );
    }

    console.warn(
      `Discord 429: รอ ${retryAfter} วินาที`
    );

    await sleep(retryAfter * 1000 + 250);
  }
}

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

  // ตรวจสอบข้อมูล
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

  // ตรวจสอบลิงก์หลักฐาน
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

  // สร้างรายงาน
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
  };

  try {
    // ส่งรายงานด้วยระบบจัดการ 429
    await sendDiscordWebhook(webhook, payload);

    return res.json({
      message: "ส่งรายงานสำเร็จแล้ว ♡"
    });
  } catch (error) {
    console.error(
      "ส่งรายงานผิดพลาด:",
      error.message
    );

    return res.status(502).json({
      error: "ส่งรายงานไม่สำเร็จ กรุณาลองใหม่ภายหลัง"
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
