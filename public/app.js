
"use strict";

const SUPABASE_FUNCTION_URL =
  "https://jonmdnlmmxnibsclftix.supabase.co/functions/v1/lumi-report";

const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_lGPdtXs0tL9tkzBHC5tAFg_RZCsufDM";

const form = document.getElementById("reportForm");
const button = document.getElementById("submitButton");
const statusBox = document.getElementById("status");

function showStatus(message, type) {
  statusBox.textContent = message;
  statusBox.className = "show " + type;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!form.reportValidity()) {
    showStatus("กรุณากรอกข้อมูลให้ครบถ้วน", "error");
    return;
  }

  const evidence = form.elements.evidence.value.trim();

  if (evidence) {
    try {
      const url = new URL(evidence);
      if (url.protocol !== "https:") throw new Error();
    } catch {
      showStatus("ลิงก์หลักฐานต้องเป็น HTTPS ที่ถูกต้อง", "error");
      return;
    }
  }

  const payload = {
    username: form.elements.username.value.trim(),
    category: form.elements.category.value,
    details: form.elements.details.value.trim(),
    evidence
  };

  button.disabled = true;
  button.textContent = "กำลังส่งรายงาน...";
  showStatus("กำลังบันทึกรายงาน กรุณารอสักครู่", "success");

  try {
    const response = await fetch(SUPABASE_FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_PUBLISHABLE_KEY
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        data.error || `ส่งรายงานไม่สำเร็จ (HTTP ${response.status})`
      );
    }

    showStatus(
      data.message || "บันทึกรายงานแล้ว",
      data.discordSent === false ? "error" : "success"
    );

    if (data.saved) form.reset();
  } catch (error) {
    console.error("Lumi Support:", error);
    showStatus(
      error.message === "Failed to fetch"
        ? "เชื่อมต่อระบบรับรายงานไม่ได้ กรุณาตรวจสอบการตั้งค่า"
        : error.message || "ส่งรายงานไม่สำเร็จ กรุณาลองใหม่",
      "error"
    );
  } finally {
    button.disabled = false;
    button.textContent = "ส่งรายงาน ♡";
  }
});
