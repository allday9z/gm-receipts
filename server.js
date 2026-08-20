const path = require("path");
const express = require("express");
const multer = require("multer");
const { extractFromImage } = require("./lib/ai");
const { submitToSheet, isConfigured } = require("./lib/sheet");

const PORT = process.env.PORT || 3000;
const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15MB — phone camera photos can be large

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES },
});

const PAYMENT_TYPES = ["เงินสด", "โอนเงิน", "บัตรเครดิตบริษัท", "บัตรเครดิตส่วนตัว", "อื่นๆ"];
const SUBMITTERS = ["CW", "WC", "BK", "PP", "WTG"];

app.get("/api/config", (_req, res) => {
  res.json({
    paymentTypes: PAYMENT_TYPES,
    submitters: SUBMITTERS,
    sheetConnected: isConfigured(),
  });
});

app.post("/api/extract", upload.single("receipt"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ ok: false, error: "ไม่พบไฟล์รูปที่อัปโหลด" });
  }
  try {
    const { fields, provider } = await extractFromImage(req.file.buffer, req.file.mimetype);
    res.json({ ok: true, fields, provider });
  } catch (err) {
    res.status(502).json({
      ok: false,
      error: "อ่านข้อมูลจากรูปอัตโนมัติไม่สำเร็จ กรุณากรอกข้อมูลเองค่ะ",
      detail: err.message,
    });
  }
});

app.post("/api/submit", upload.single("receipt"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ ok: false, error: "ไม่พบไฟล์ใบเสร็จที่อัปโหลด" });
  }
  const b = req.body || {};
  if (!PAYMENT_TYPES.includes(b.paymentType)) {
    return res.status(400).json({ ok: false, error: "ประเภทการชำระเงินไม่ถูกต้อง" });
  }
  if (!SUBMITTERS.includes(b.submitter)) {
    return res.status(400).json({ ok: false, error: "กรุณาเลือกผู้ส่ง" });
  }

  const payload = {
    date: b.date || new Date().toISOString().slice(0, 10),
    taxInvoiceNo: b.taxInvoiceNo || "",
    vendorName: b.vendorName || "",
    description: b.description || "",
    taxId: b.taxId || "",
    subtotal: parseFloat(b.subtotal || "0") || 0,
    vat: parseFloat(b.vat || "0") || 0,
    total: parseFloat(b.total || "0") || 0,
    paymentType: b.paymentType,
    submitter: b.submitter,
    fileName: req.file.originalname,
    mimeType: req.file.mimetype,
    fileBase64: req.file.buffer.toString("base64"),
  };

  try {
    const result = await submitToSheet(payload);
    res.json({ ok: true, result });
  } catch (err) {
    const notConfigured = err.code === "SHEET_NOT_CONFIGURED";
    res.status(notConfigured ? 503 : 502).json({
      ok: false,
      error: err.message,
      notConfigured,
    });
  }
});

app.listen(PORT, () => {
  console.log(`gm-receipts listening on :${PORT}`);
});
