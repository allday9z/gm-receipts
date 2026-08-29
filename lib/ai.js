const sharp = require("sharp");

// Primary: an OpenAI-compatible gateway M2 provided (no observed daily cap,
// unlike Gemini's free tier — see the KNPLAB_* vars below). Secondary:
// Gemini directly, kept as a fallback in case the gateway is unreachable
// or its underlying model can't handle a given image.
const KNPLAB_BASE_URL = process.env.KNPLAB_BASE_URL || "https://streamapi.knplabai.com";
const KNPLAB_API_KEY = process.env.KNPLAB_API_KEY || "";
const KNPLAB_MODEL = process.env.KNPLAB_MODEL || "gemini-2.5-flash-lite";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest";
const GEMINI_DAILY_LIMIT = parseInt(process.env.GEMINI_DAILY_LIMIT || "500", 10);

const FIELDS = [
  "taxInvoiceNo",
  "vendorName",
  "description",
  "taxId",
  "subtotal",
  "vat",
  "total",
];

const PROMPT = `คุณเป็นผู้เชี่ยวชาญอ่านข้อมูลจากรูปใบเสร็จ/ใบกำกับภาษี หรือภาพหน้าจอ (screenshot) คำสั่งซื้อออนไลน์ เช่น Shopee, Lazada — อาจเป็นรูปถ่ายด้วยมือถือจากหน้าร้าน (ถ่ายเอียง, มีแสงสะท้อน/แฟลชกระทบกระดาษมัน, กระดาษยับหรือจางเพราะเป็นกระดาษความร้อน, พร่ามัว) หรือเป็น screenshot คำสั่งซื้อจากแอป/เว็บ ให้พยายามอ่านให้ดีที่สุดโดยใช้บริบทช่วย (เช่น ตัวเลขที่พร่ามัวให้เทียบกับตัวเลขอื่นในบิลเดียวกัน)

ดึงข้อมูลต่อไปนี้จากรูปแล้วตอบเป็น JSON เท่านั้น ไม่ต้องมีคำอธิบายอื่น ไม่ต้องใส่ markdown code fence:
{
  "taxInvoiceNo": "เลขที่ใบกำกับภาษี — ถ้าเป็น screenshot คำสั่งซื้อออนไลน์ที่ไม่มีเลขใบกำกับภาษีทางการ ให้ใช้เลขที่คำสั่งซื้อ/หมายเลขออเดอร์ (Order ID) แทน (string, ถ้าไม่เจอเลยให้เป็น \\"\\")",
  "vendorName": "ชื่อผู้ขาย/ร้านค้า — รวมถึงชื่อร้านค้าบนแพลตฟอร์มออนไลน์ เช่น ชื่อร้านใน Shopee (string)",
  "description": "รายละเอียดบิล/รายการสั้นๆ — ถ้ามีหลายรายการให้สรุปรวมสั้นๆ เช่น \\"กระดาษ A4, ปากกา\\" (string)",
  "taxId": "เลขประจำตัวผู้เสียภาษี 13 หลัก — คำสั่งซื้อออนไลน์ทั่วไปมักไม่มี ถ้าไม่เจอให้เป็น \\"\\" (string)",
  "subtotal": "ยอดก่อน VAT เป็นตัวเลข — ถ้าเป็น screenshot ที่ไม่มีการแยก VAT ให้ใช้ยอดชำระทั้งหมดเป็นค่านี้เหมือนกับ total (number, ไม่มี comma)",
  "vat": "ยอด VAT 7% เป็นตัวเลข — ถ้าไม่มีการแยก VAT แสดง (เช่น screenshot คำสั่งซื้อออนไลน์ส่วนใหญ่) ให้ใส่ 0 (number)",
  "total": "ยอดรวมสุทธิที่ต้องจ่ายจริงเป็นตัวเลข — สำหรับคำสั่งซื้อออนไลน์คือยอดชำระทั้งหมดหลังหักส่วนลด/รวมค่าส่งแล้ว (number)"
}
ถ้าอ่านตัวเลขไม่ชัด ให้ใช้ความสัมพันธ์ subtotal + vat = total และ vat = subtotal * 0.07 ช่วยคำนวณ/ตรวจทานตัวเลขที่เหลือ (ใช้กับใบกำกับภาษีที่มี VAT เท่านั้น — อย่าบังคับสูตรนี้กับ screenshot คำสั่งซื้อออนไลน์ที่ไม่มี VAT) ถ้ายังไม่มั่นใจจริงๆ ให้ใส่ 0 (อย่าเดามั่ว)`;

// Reset daily counter at midnight by tracking the day-of-year it was started.
let geminiCallCount = 0;
let geminiCountDay = new Date().toDateString();

function bumpGeminiCounter() {
  const today = new Date().toDateString();
  if (today !== geminiCountDay) {
    geminiCountDay = today;
    geminiCallCount = 0;
  }
  geminiCallCount += 1;
  return geminiCallCount;
}

function extractJson(text) {
  if (!text) throw new Error("empty response");
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch (_) {
    // model sometimes wraps JSON in prose or code fences — pull out the first {...} block
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error("could not parse JSON from model response");
  }
}

function normalize(raw) {
  const out = {};
  for (const f of FIELDS) {
    const v = raw[f];
    if (f === "subtotal" || f === "vat" || f === "total") {
      const n = typeof v === "number" ? v : parseFloat(String(v || "0").replace(/,/g, ""));
      out[f] = Number.isFinite(n) ? n : 0;
    } else {
      out[f] = v == null ? "" : String(v);
    }
  }
  return out;
}

// Phone photos (especially iPhone) often carry an EXIF orientation tag
// instead of physically-rotated pixels — not every image consumer respects
// it. sharp's rotate() with no args reads that tag and bakes the rotation
// into the pixels (then strips the tag, since it's now redundant). Also
// downsizes to a sane max dimension: full-resolution phone photos (3000px+
// on the long edge) cost more to transmit/process without helping OCR, and
// normalizing to one predictable format/size makes results more repeatable
// across different phones/cameras. Never let preprocessing itself become a
// new failure mode — fall back to the original bytes on any error (e.g. a
// format sharp can't decode) rather than blocking extraction entirely.
async function preprocessImage(buffer) {
  try {
    const out = await sharp(buffer)
      .rotate()
      .resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 90 })
      .toBuffer();
    return { buffer: out, mimeType: "image/jpeg" };
  } catch (err) {
    return { buffer, mimeType: null };
  }
}

async function callKnpLab(base64, mimeType, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${KNPLAB_BASE_URL}/v1/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${KNPLAB_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: KNPLAB_MODEL,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: PROMPT },
              { type: "image_url", image_url: { url: `data:${mimeType || "image/jpeg"};base64,${base64}` } },
            ],
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0.15,
        stream: false,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`knplab http ${res.status}: ${body.slice(0, 300)}`);
    }
    const data = await res.json();
    const text = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    return normalize(extractJson(text));
  } finally {
    clearTimeout(timeout);
  }
}

async function callGemini(base64, mimeType, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": GEMINI_API_KEY,
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: PROMPT },
                { inlineData: { mimeType: mimeType || "image/jpeg", data: base64 } },
              ],
            },
          ],
          // Low (not zero — some models degrade oddly at exactly 0)
          // temperature for consistency: this is a structured-extraction
          // task, not creative writing, so the same receipt should produce
          // the same reading every time.
          generationConfig: { responseMimeType: "application/json", temperature: 0.15 },
        }),
      }
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`gemini http ${res.status}: ${body.slice(0, 300)}`);
    }
    const data = await res.json();
    const text =
      data &&
      data.candidates &&
      data.candidates[0] &&
      data.candidates[0].content &&
      data.candidates[0].content.parts &&
      data.candidates[0].content.parts[0] &&
      data.candidates[0].content.parts[0].text;
    return normalize(extractJson(text));
  } finally {
    clearTimeout(timeout);
  }
}

async function tryKnpLab(base64, mimeType) {
  if (!KNPLAB_API_KEY) throw new Error("KNPLAB_API_KEY not configured");
  try {
    return await callKnpLab(base64, mimeType, 35000);
  } catch (firstErr) {
    try {
      return await callKnpLab(base64, mimeType, 35000);
    } catch (secondErr) {
      throw new Error(`${secondErr.message} (retry also failed: ${firstErr.message})`);
    }
  }
}

async function tryGemini(base64, mimeType) {
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not configured");
  const count = bumpGeminiCounter();
  if (count > GEMINI_DAILY_LIMIT) {
    throw new Error(`gemini daily limit (${GEMINI_DAILY_LIMIT}) reached`);
  }
  // One retry on failure (timeout, transient API error, or an occasional
  // malformed JSON response) — a single photo shouldn't have to be
  // re-uploaded by the requester just because one call had a hiccup.
  try {
    return await callGemini(base64, mimeType, 35000);
  } catch (firstErr) {
    try {
      return await callGemini(base64, mimeType, 35000);
    } catch (secondErr) {
      throw new Error(`${secondErr.message} (retry also failed: ${firstErr.message})`);
    }
  }
}

// KnpLab gateway first (no observed daily cap — see KNPLAB_BASE_URL above),
// Gemini second. Gemini alone hit a hard, undocumented-until-we-hit-it
// 20-requests/day free-tier cap shared with the PRF app (see
// ψ/writing/gm-receipts-domain.md in the neo-oracle repo) — that's the
// entire reason a second provider exists again after M2 previously asked
// for Gemini-only. Both fail closed to the same place: the form asks the
// requester to fill in fields manually rather than erroring out.
async function extractFromImage(buffer, mimeType) {
  const pre = await preprocessImage(buffer);
  const base64 = pre.buffer.toString("base64");
  const effectiveMimeType = pre.mimeType || mimeType;
  const errors = [];
  try {
    return { fields: await tryKnpLab(base64, effectiveMimeType), provider: "knplab" };
  } catch (err) {
    errors.push(`knplab: ${err.message}`);
  }
  try {
    return { fields: await tryGemini(base64, effectiveMimeType), provider: "gemini" };
  } catch (err) {
    errors.push(`gemini: ${err.message}`);
  }
  const wrapped = new Error(`AI extraction failed — ${errors.join(" | ")}`);
  wrapped.providerErrors = errors;
  throw wrapped;
}

module.exports = { extractFromImage, FIELDS };
