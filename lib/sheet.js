const SHEET_WEBAPP_URL = process.env.SHEET_WEBAPP_URL || "";

function isConfigured() {
  return Boolean(SHEET_WEBAPP_URL);
}

// Forwards one receipt submission to the Google Apps Script Web App that
// Pichayapa deploys herself (see google-apps-script/Code.gs + README.md).
// The script appends a row to her Sheet and saves the file to Drive.
async function submitToSheet(payload) {
  if (!isConfigured()) {
    const err = new Error(
      "ยังไม่ได้เชื่อมกับ Google Sheet — รอ Pichayapa deploy Google Apps Script แล้วส่ง Web App URL มาตั้งค่า SHEET_WEBAPP_URL"
    );
    err.code = "SHEET_NOT_CONFIGURED";
    throw err;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(SHEET_WEBAPP_URL, {
      method: "POST",
      redirect: "follow",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (_) {
      data = { raw: text };
    }
    if (!res.ok || data.ok === false) {
      throw new Error(
        `Apps Script ตอบว่าไม่สำเร็จ (${res.status}): ${data.error || text.slice(0, 300)}`
      );
    }
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { submitToSheet, isConfigured };
