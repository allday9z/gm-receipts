/**
 * GM Receipts — Apps Script Web App
 *
 * Deploy this bound to the GM receipts Google Sheet (Extensions > Apps Script).
 * It appends one row per receipt submission and saves the attached file to
 * a Drive folder, then returns { ok: true } or { ok: false, error }.
 *
 * Expected sheet header row (create it once, exactly in this order) on the
 * first sheet tab:
 *   Date | Tax Invoice NO. | Vendor Name | รายละเอียดบิล | Tax ID | Sub total | Vat 7% | Total | ประเภทการชำระเงิน | ผู้ส่ง | Drive Link
 */

var ATTACHMENTS_FOLDER_NAME = "GM Receipts Attachments";

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    var driveUrl = "";

    if (body.fileBase64) {
      var folder = getOrCreateFolder(ATTACHMENTS_FOLDER_NAME);
      var bytes = Utilities.base64Decode(body.fileBase64);
      var blob = Utilities.newBlob(bytes, body.mimeType || "application/octet-stream", body.fileName || "receipt");
      var file = folder.createFile(blob);
      driveUrl = file.getUrl();
    }

    sheet.appendRow([
      body.date || "",
      body.taxInvoiceNo || "",
      body.vendorName || "",
      body.description || "",
      body.taxId || "",
      Number(body.subtotal) || 0,
      Number(body.vat) || 0,
      Number(body.total) || 0,
      body.paymentType || "",
      body.submitter || "",
      driveUrl,
    ]);

    return jsonResponse({ ok: true, driveUrl: driveUrl });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) });
  }
}

function getOrCreateFolder(name) {
  var folders = DriveApp.getFoldersByName(name);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(name);
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}

// Optional: hit this once from the script editor (Run > doGet) just to sanity
// check permissions are granted; the real app only ever calls doPost.
function doGet() {
  return jsonResponse({ ok: true, info: "GM Receipts Apps Script is alive" });
}
