# gm-receipts

GM team receipt/tax-invoice collection — upload, AI extract, Google Sheet sync

ระบบเก็บใบเสร็จ/ใบกำกับภาษีของทีม GM — Link เดียวใช้ร่วมกันทั้งทีม (ไม่ต้อง login), ถ่ายรูป/อัปโหลดใบเสร็จ, AI ช่วยอ่านข้อมูลจากรูปให้อัตโนมัติ, บันทึกเข้า Google Sheet + Google Drive ผ่าน Apps Script

## Stack

- Node.js + Express, vanilla JS frontend (ไม่มี framework/database — Google Sheet เป็น source of truth)
- AI extraction: self-hosted Ollama vision model ก่อน (`OLLAMA_URL` + `AI_VISION_MODEL`), fallback เป็น Gemini (`GEMINI_API_KEY` + `GEMINI_MODEL`) ถ้า Ollama ใช้ไม่ได้
- Sync ไปยัง Google Sheet ผ่าน Google Apps Script Web App ที่ผู้ใช้ deploy เอง (ดู `google-apps-script/README.md`) — ไม่มี Google service-account credential ในระบบ

## Env vars

| Key | ใช้ทำอะไร |
|---|---|
| `PORT` | พอร์ตที่แอปฟัง (default 3000) |
| `OLLAMA_URL` | endpoint ของ Ollama server สำหรับ vision extraction |
| `AI_VISION_MODEL` | ชื่อโมเดล vision ที่เรียกบน Ollama |
| `GEMINI_API_KEY` | fallback provider ถ้า Ollama ใช้ไม่ได้ |
| `GEMINI_MODEL` | ชื่อโมเดล Gemini |
| `GEMINI_DAILY_LIMIT` | จำกัดจำนวนครั้งเรียก Gemini ต่อวัน (กัน quota shared กับแอปอื่น) |
| `SHEET_WEBAPP_URL` | Web App URL ของ Google Apps Script (ตั้งหลัง deploy สคริปต์แล้วเท่านั้น — ถ้าไม่ตั้ง ระบบจะรับข้อมูลแต่บันทึกเข้า Sheet ไม่สำเร็จ พร้อมแจ้งเตือนชัดเจน) |

## Local dev

```bash
npm install
OLLAMA_URL=... AI_VISION_MODEL=... GEMINI_API_KEY=... GEMINI_MODEL=... npm start
```

## Deploy

Docker-based deploy (Coolify) — ดู `Dockerfile`. ตั้ง env vars ด้านบนใน Coolify application settings.
