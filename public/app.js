(function () {
  const form = document.getElementById("receipt-form");
  const cameraInput = document.getElementById("camera-input");
  const fileInput = document.getElementById("file-input");
  const preview = document.getElementById("preview");
  const previewImg = document.getElementById("preview-img");
  const previewFilename = document.getElementById("preview-filename");
  const extractStatus = document.getElementById("extract-status");
  const submitStatus = document.getElementById("submit-status");
  const submitBtn = document.getElementById("submit-btn");
  const paymentTypeSel = document.getElementById("paymentType");
  const submitterSel = document.getElementById("submitter");
  const sheetBanner = document.getElementById("sheet-banner");
  const dateInput = document.getElementById("date");

  let currentFile = null;

  dateInput.value = new Date().toISOString().slice(0, 10);

  function setStatus(el, type, text) {
    el.className = `status ${type}`;
    el.textContent = text;
  }
  function clearStatus(el) {
    el.className = "status hidden";
    el.textContent = "";
  }

  fetch("/api/config")
    .then((r) => r.json())
    .then((cfg) => {
      for (const opt of cfg.paymentTypes) {
        const o = document.createElement("option");
        o.value = opt;
        o.textContent = opt;
        paymentTypeSel.appendChild(o);
      }
      for (const opt of cfg.submitters) {
        const o = document.createElement("option");
        o.value = opt;
        o.textContent = opt;
        submitterSel.appendChild(o);
      }
      if (!cfg.sheetConnected) {
        sheetBanner.classList.remove("hidden");
        sheetBanner.textContent =
          "⚠️ ระบบยังไม่เชื่อมกับ Google Sheet (รอ Pichayapa deploy Apps Script) — บันทึกตอนนี้จะยังไม่สำเร็จ";
      }
    })
    .catch(() => {});

  function onFileChosen(file) {
    if (!file) return;
    currentFile = file;
    submitBtn.disabled = false;

    if (file.type.startsWith("image/")) {
      const url = URL.createObjectURL(file);
      previewImg.src = url;
      previewImg.classList.remove("hidden");
    } else {
      previewImg.classList.add("hidden");
    }
    previewFilename.textContent = file.name;
    preview.classList.remove("hidden");

    if (file.type.startsWith("image/")) {
      runExtract(file);
    }
  }

  cameraInput.addEventListener("change", (e) => onFileChosen(e.target.files[0]));
  fileInput.addEventListener("change", (e) => onFileChosen(e.target.files[0]));

  async function runExtract(file) {
    setStatus(extractStatus, "info", "🤖 กำลังอ่านข้อมูลจากรูปอัตโนมัติ...");
    extractStatus.classList.remove("hidden");
    try {
      const fd = new FormData();
      fd.append("receipt", file);
      const res = await fetch("/api/extract", { method: "POST", body: fd });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "extract failed");
      const f = data.fields;
      document.getElementById("taxInvoiceNo").value = f.taxInvoiceNo || "";
      document.getElementById("vendorName").value = f.vendorName || "";
      document.getElementById("description").value = f.description || "";
      document.getElementById("taxId").value = f.taxId || "";
      document.getElementById("subtotal").value = f.subtotal || "";
      document.getElementById("vat").value = f.vat || "";
      document.getElementById("total").value = f.total || "";
      setStatus(extractStatus, "success", "✅ อ่านข้อมูลอัตโนมัติแล้ว กรุณาเช็ค/แก้ให้ถูกต้องก่อนบันทึก");
    } catch (err) {
      setStatus(extractStatus, "error", "อ่านข้อมูลอัตโนมัติไม่สำเร็จ กรุณากรอกข้อมูลด้วยตัวเองค่ะ");
    }
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!currentFile) return;
    clearStatus(submitStatus);
    submitBtn.disabled = true;
    submitBtn.textContent = "กำลังบันทึก...";

    const fd = new FormData();
    fd.append("receipt", currentFile);
    const fields = [
      "date",
      "taxInvoiceNo",
      "vendorName",
      "description",
      "taxId",
      "subtotal",
      "vat",
      "total",
      "paymentType",
      "submitter",
    ];
    for (const f of fields) {
      fd.append(f, document.getElementById(f).value || "");
    }

    try {
      const res = await fetch("/api/submit", { method: "POST", body: fd });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "submit failed");
      setStatus(submitStatus, "success", "✅ บันทึกใบเสร็จเรียบร้อยค่ะ");
      form.reset();
      dateInput.value = new Date().toISOString().slice(0, 10);
      preview.classList.add("hidden");
      clearStatus(extractStatus);
      currentFile = null;
    } catch (err) {
      setStatus(submitStatus, "error", "❌ " + err.message);
    } finally {
      submitBtn.disabled = !currentFile;
      submitBtn.textContent = "บันทึกใบเสร็จ";
    }
  });
})();
