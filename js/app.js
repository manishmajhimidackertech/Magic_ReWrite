"use strict";

import { state } from "./modules/state.js";
import {
  fileInp,
  openBtn,
  ovOpenBtn,
  reextBtn,
  closeBtn,
  recombineBtn,
  closeBtnInsert,
  freeAcctBtn,
  paidAcctBtn,
  downloadBtn,
  docHTML,
  docNotesPage,
  docNotesHtml,
  initOv,
  docWS,
  rpWS,
  revisedWS,
  revisedDocHtml,
  revisedDocNotesPage,
  revisedDocNotesHtml,
  humanizedDocWS,
  tbTitle,
  lpTitle,
  lpWords,
  rpTitle,
  rpBadges,
  fileTab,
  insertTab,
  ribbonFile,
  ribbonInsert,
  leftPane,
  fileHeader,
  insertLeftHeader,
  fileDocView,
  insertPasteView,
  fileRightPane,
  insertRightPane,
  titlebarEl,
  tabrowEl,
  ribbonEl2,
  ribbonArea,
  setDownloadBtnLabel,
  revisedFileName,
  showLoad,
  hideLoad,
} from "./modules/ui.js";
import {
  renderExtractedCanvases,
  renderInsertCanvases,
  addInsertCanvas,
  updateRevisedPreview,
  updateRevisedWords,
} from "./modules/canvases.js";
import { placeRevision } from "./modules/placement.js";
import { processFile, reExtract } from "./modules/file-processor.js";
import { renderNotesPage } from "./modules/footnotes.js";
import { loadScript, patchDocumentXml } from "./modules/docx-writer.js";

/* ═══════════════════════════════════════════════
     ACCOUNT TOGGLE
  ═══════════════════════════════════════════════ */
freeAcctBtn.addEventListener("click", () => {
  if (!state.isPaidAccount) return;
  state.isPaidAccount = false;
  freeAcctBtn.classList.add("active");
  paidAcctBtn.classList.remove("active");
  if (state.curExtracted) renderExtractedCanvases();
});

paidAcctBtn.addEventListener("click", () => {
  if (state.isPaidAccount) return;
  state.isPaidAccount = true;
  paidAcctBtn.classList.add("active");
  freeAcctBtn.classList.remove("active");
  if (state.curExtracted) renderExtractedCanvases();
});

/* ═══════════════════════════════════════════════
     TAB SWITCHING
  ═══════════════════════════════════════════════ */
function switchToFile() {
  state.insertMode = false;
  titlebarEl.classList.remove("sw-theme");
  tabrowEl.classList.remove("sw-theme");
  ribbonEl2.classList.remove("insert-ribbon");
  ribbonArea.classList.remove("sw-theme");
  fileTab.classList.add("file");
  insertTab.classList.remove("active-insert");
  if (state.curFile) tbTitle.textContent = "Document - " + state.curFile.name;
  ribbonFile.style.display = "flex";
  ribbonInsert.style.display = "none";
  leftPane.classList.remove("insert-mode");
  fileHeader.style.display = "";
  insertLeftHeader.style.display = "none";
  fileDocView.style.display = "flex";
  insertPasteView.style.display = "none";
  fileRightPane.style.display = "flex";
  insertRightPane.style.display = "none";
}

function switchToInsert() {
  if (!state.curFile) return;
  state.insertMode = true;
  titlebarEl.classList.add("sw-theme");
  tabrowEl.classList.add("sw-theme");
  ribbonEl2.classList.add("insert-ribbon");
  ribbonArea.classList.add("sw-theme");
  fileTab.classList.remove("file");
  insertTab.classList.add("active-insert");
  insertTab.classList.remove("ready");
  tbTitle.textContent = "Document - " + revisedFileName(state.curFile.name);
  ribbonFile.style.display = "none";
  ribbonInsert.style.display = "flex";
  leftPane.classList.add("insert-mode");
  fileHeader.style.display = "none";
  insertLeftHeader.style.display = "";
  fileDocView.style.display = "none";
  insertPasteView.style.display = "flex";
  fileRightPane.style.display = "none";
  insertRightPane.style.display = "flex";
  if (revisedWS.children.length === 0) renderInsertCanvases();
  recombineBtn.disabled = state.canvasTexts.length <= 1;
  setTimeout(() => {
    const f = revisedWS.querySelector(".humanized-content");
    if (f) f.focus();
  }, 650);
}

fileTab.addEventListener("click", () => {
  if (!state.insertMode) return;
  switchToFile();
});
insertTab.addEventListener("click", () => {
  if (state.insertMode) return;
  switchToInsert();
});

/* ═══════════════════════════════════════════════
     RE-COMBINE
  ═══════════════════════════════════════════════ */
recombineBtn.addEventListener("click", async () => {
  if (!state.revisedTexts.length) return;
  const combined = state.revisedTexts.filter((t) => t.trim()).join("\n\n\n\n");
  if (!combined) return;

  revisedWS.innerHTML = "";
  state.canvasTexts = [state.curExtracted];
  // The line records go along. Text from a canvas left empty is missing
  // from the combined text, so its line count then differs and the
  // combined canvas is matched by wording instead.
  state.canvasLines = [state.canvasLines.flat()];
  state.revisedTexts = [combined];
  recombineBtn.disabled = true;

  addInsertCanvas(0, "Revised Text", "All revised text combined here…", combined);

  updateRevisedWords();
  updateRevisedPreview();
});

/* ═══════════════════════════════════════════════
     CLOSE
  ═══════════════════════════════════════════════ */
function doClose() {
  state.curFile = null;
  state.curExtracted = "";
  state.lines = [];
  state.canvasLines = [];
  state.originalDocHtml = "";
  state.docNotesHtml = "";
  state.canvasTexts = [];
  state.revisedTexts = [];

  docHTML.innerHTML = "";
  renderNotesPage(docNotesPage, docNotesHtml, "");
  renderNotesPage(revisedDocNotesPage, revisedDocNotesHtml, "");
  const rpWS = document.getElementById("rpWS");
  rpWS.innerHTML = "";
  revisedWS.innerHTML = "";
  revisedDocHtml.innerHTML =
    '<p style="color:#888;font-style:italic;">The document preview will appear here after you paste revised text on the left.</p>';

  initOv.style.display = "flex";
  tbTitle.textContent = "Magic ReWrite";
  lpTitle.textContent = "No document open";
  lpWords.textContent = "Open a document to begin";
  rpTitle.textContent = "Extracted Text";
  rpBadges.innerHTML = "";

  [reextBtn, closeBtn].forEach((b) => (b.disabled = true));
  recombineBtn.disabled = true;
  downloadBtn.disabled = true;
  fileInp.value = "";
  insertTab.classList.remove("ready", "active-insert");
  fileTab.classList.add("file");
  if (state.insertMode) switchToFile();
}
closeBtn.onclick = doClose;
closeBtnInsert.addEventListener("click", doClose);

/* ═══════════════════════════════════════════════
     RE-EXTRACT
  ═══════════════════════════════════════════════ */
reextBtn.onclick = () => reExtract();

/* ═══════════════════════════════════════════════
     DOWNLOAD REVISED DOCX
  ═══════════════════════════════════════════════ */
downloadBtn.addEventListener("click", async () => {
  if (!state.curFile) return;
  if (!state.revisedTexts.some((t) => t.trim())) return;

  downloadBtn.disabled = true;
  setDownloadBtnLabel("💾", "Copying…");
  try {
    await loadScript("vendor/jszip.min.js");
    const buf = await state.curFile.arrayBuffer();
    const zip = await JSZip.loadAsync(buf);

    const { placements } = placeRevision(state.canvasLines, state.revisedTexts);

    let rawXml = await zip.file("word/document.xml").async("string");
    rawXml = patchDocumentXml(rawXml, placements);
    zip.file("word/document.xml", rawXml);

    const blob = await zip.generateAsync({
      type: "blob",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });
    const fname = revisedFileName(state.curFile.name);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fname;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 3000);

    setDownloadBtnLabel("✓", "Downloaded!");
    downloadBtn.classList.add("ok");
    setTimeout(() => {
      setDownloadBtnLabel("💾", "Download<br>.docx");
      downloadBtn.classList.remove("ok");
      downloadBtn.disabled = false;
    }, 2500);
  } catch (err) {
    console.error("Download error", err);
    setDownloadBtnLabel("💾", "Download<br>.docx");
    downloadBtn.disabled = false;
  }
});

/* ═══════════════════════════════════════════════
     EVENT WIRING – open / drag-drop / keyboard
  ═══════════════════════════════════════════════ */
openBtn.onclick = () => fileInp.click();
ovOpenBtn.onclick = () => fileInp.click();
fileInp.onchange = (e) => {
  if (e.target.files[0]) processFile(e.target.files[0]);
};

docWS.addEventListener("dragover", (e) => {
  e.preventDefault();
  docWS.classList.add("dragging");
  initOv.classList.add("drag");
});
docWS.addEventListener("dragleave", () => {
  docWS.classList.remove("dragging");
  initOv.classList.remove("drag");
});
docWS.addEventListener("drop", (e) => {
  e.preventDefault();
  docWS.classList.remove("dragging");
  initOv.classList.remove("drag");
  const f = e.dataTransfer.files[0];
  if (f) processFile(f);
});
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "o") {
    e.preventDefault();
    fileInp.click();
  }
});

/* ═══════════════════════════════════════════════
     SCROLL-TO-TOP BUTTONS
  ═══════════════════════════════════════════════ */
(function () {
  const THRESHOLD = 150;
  const pairs = [
    {
      scroller: document.getElementById("docWS"),
      btn: document.getElementById("docScrollTop"),
    },
    {
      scroller: document.getElementById("rpWS"),
      btn: document.getElementById("rpScrollTop"),
    },
    {
      scroller: revisedWS,
      btn: document.getElementById("humScrollTop"),
    },
    {
      scroller: humanizedDocWS,
      btn: document.getElementById("humDocScrollTop"),
    },
  ];
  pairs.forEach(({ scroller, btn }) => {
    if (!scroller || !btn) return;
    scroller.addEventListener("scroll", () => {
      btn.classList.toggle("visible", scroller.scrollTop > THRESHOLD);
    });
    btn.addEventListener("click", () => {
      scroller.scrollTo({ top: 0, behavior: "smooth" });
    });
  });
})();
