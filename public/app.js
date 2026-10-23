
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
      if (new URL(evidence).protocol !== "https:") {
        throw new Error();
      }
    } catch {
      showStatus("ลิงก์หลักฐานต้องเป็น HTTPS ที่ถูกต้อง", "error");
      return;
    }
  }

  button.disabled = true;
  button.textContent = "กำลังส่งรายงาน...";
  showStatus("กำลังเชื่อมต่อระบบ กรุณารอสักครู่", "success");

  try {
    const response = await fetch("/api/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: form.elements.username.value.trim(),
        category: form.elements.category.value,
        details: form.elements.details.value.trim(),
        evidence
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "ส่งรายงานไม่สำเร็จ");
    }

    showStatus(data.message || "ส่งรายงานสำเร็จแล้ว ♡", "success");
    form.reset();
  } catch (error) {
    showStatus(
      error.message || "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่",
      "error"
    );
  } finally {
    button.disabled = false;
    button.textContent = "ส่งรายงาน ♡";
  }
});
