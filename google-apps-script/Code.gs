// GM Receipts — Apps Script Web App
//
// Deploy this bound to the GM receipts Google Sheet
// (Extensions > Apps Script). It appends one row per
// receipt submission, saves the attached file to Drive,
// and returns { ok: true } or { ok: false, error }.
//
// Expected header row (first sheet tab), in this order:
//   Date
//   Tax Invoice NO.
//   Vendor Name
//   รายละเอียดบิล
//   Tax ID
//   Sub total
//   Vat 7%
//   Total
//   ประเภทการชำระเงิน
//   ผู้ส่ง
//   Drive Link

var ATTACHMENTS_FOLDER_NAME = "GM Receipts Attachments";

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = spreadsheet.getSheets()[0];
    var driveUrl = "";

    if (body.fileBase64) {
      driveUrl = saveReceiptFile(body);
    }

    appendReceiptRow(sheet, body, driveUrl);

    return jsonResponse({ ok: true, driveUrl: driveUrl });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) });
  }
}

function saveReceiptFile(body) {
  var folder = getOrCreateFolder(ATTACHMENTS_FOLDER_NAME);
  var bytes = Utilities.base64Decode(body.fileBase64);
  var mimeType = body.mimeType || "application/octet-stream";
  var fileName = body.fileName || "receipt";
  var blob = Utilities.newBlob(bytes, mimeType, fileName);
  var file = folder.createFile(blob);
  return file.getUrl();
}

function appendReceiptRow(sheet, body, driveUrl) {
  var subtotal = Number(body.subtotal) || 0;
  var vat = Number(body.vat) || 0;
  var total = Number(body.total) || 0;

  sheet.appendRow([
    body.date || "",
    body.taxInvoiceNo || "",
    body.vendorName || "",
    body.description || "",
    body.taxId || "",
    subtotal,
    vat,
    total,
    body.paymentType || "",
    body.submitter || "",
    driveUrl,
  ]);
}

function getOrCreateFolder(name) {
  var folders = DriveApp.getFoldersByName(name);
  if (folders.hasNext()) {
    return folders.next();
  }
  return DriveApp.createFolder(name);
}

function jsonResponse(obj) {
  var text = JSON.stringify(obj);
  return ContentService
    .createTextOutput(text)
    .setMimeType(ContentService.MimeType.JSON);
}

// Optional: run this once from the script editor
// (Run > doGet) just to sanity-check permissions.
// The real app only ever calls doPost.
function doGet() {
  return jsonResponse({
    ok: true,
    info: "GM Receipts Apps Script is alive",
  });
}
