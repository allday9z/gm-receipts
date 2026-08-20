const OLLAMA_URL = process.env.OLLAMA_URL || "";
const AI_VISION_MODEL = process.env.AI_VISION_MODEL || "qwen3-vl:8b";
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

const PROMPT = `คุณเป็นผู้ช่วยอ่านข้อมูลจากรูปใบเสร็จ/ใบกำกับภาษี ให้ดึงข้อมูลต่อไปนี้จากรูปแล้วตอบเป็น JSON เท่านั้น ไม่ต้องมีคำอธิบายอื่น ไม่ต้องใส่ markdown code fence:
{
  "taxInvoiceNo": "เลขที่ใบกำกับภาษี (string, ถ้าไม่เจอให้เป็น \\"\\")",
  "vendorName": "ชื่อผู้ขาย/ร้านค้า (string)",
  "description": "รายละเอียดบิล/รายการสั้นๆ (string)",
  "taxId": "เลขประจำตัวผู้เสียภาษี 13 หลัก (string)",
  "subtotal": "ยอดก่อน VAT เป็นตัวเลข (number, ไม่มี comma)",
  "vat": "ยอด VAT 7% เป็นตัวเลข (number)",
  "total": "ยอดรวมสุทธิเป็นตัวเลข (number)"
}
ถ้าอ่านตัวเลขไม่ชัดให้ประมาณจากยอดรวมและ VAT 7% ถ้าคำนวณได้ ถ้าไม่มั่นใจให้ใส่ 0`;

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

async function tryOllama(base64, mimeType) {
  if (!OLLAMA_URL) throw new Error("OLLAMA_URL not configured");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  try {
    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: AI_VISION_MODEL,
        stream: false,
        format: "json",
        messages: [
          {
            role: "user",
            content: PROMPT,
            images: [base64],
          },
        ],
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ollama http ${res.status}: ${body.slice(0, 300)}`);
    }
    const data = await res.json();
    const content = data && data.message && data.message.content;
    return normalize(extractJson(content));
  } finally {
    clearTimeout(timeout);
  }
}

async function tryGemini(base64, mimeType) {
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not configured");
  const count = bumpGeminiCounter();
  if (count > GEMINI_DAILY_LIMIT) {
    throw new Error(`gemini daily limit (${GEMINI_DAILY_LIMIT}) reached`);
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
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
          generationConfig: { responseMimeType: "application/json" },
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

// Try the self-hosted Ollama vision model first (free, internal), fall back to
// Gemini (external, rate-limited, shared quota with other apps) only if Ollama
// fails or the model isn't available on the server.
async function extractFromImage(buffer, mimeType) {
  const base64 = buffer.toString("base64");
  const errors = [];
  try {
    return { fields: await tryOllama(base64, mimeType), provider: "ollama" };
  } catch (err) {
    errors.push(`ollama: ${err.message}`);
  }
  try {
    return { fields: await tryGemini(base64, mimeType), provider: "gemini" };
  } catch (err) {
    errors.push(`gemini: ${err.message}`);
  }
  const err = new Error(`AI extraction failed — ${errors.join(" | ")}`);
  err.providerErrors = errors;
  throw err;
}

module.exports = { extractFromImage, FIELDS };
