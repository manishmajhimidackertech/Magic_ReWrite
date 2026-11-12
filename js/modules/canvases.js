"use strict";

import {
  COPY_SVG,
  rpWS,
  revisedWS,
  revisedWords,
  revisedDocHtml,
  revisedDocNotesPage,
  revisedDocNotesHtml,
  downloadBtn,
  recombineBtn,
  insertRpSub,
  doCopy,
} from "./ui.js";
import { buildRevisedHtml } from "./preview.js";
import { renderNotesPage } from "./footnotes.js";
import { splitIntoCanvases, linesPerCanvas } from "./extractor.js";
import { placeRevision } from "./placement.js";
import { FREE_WORD_LIMIT, PAID_WORD_LIMIT } from "./constants.js";
import { state } from "./state.js";

/* ═══════════════════════════════════════════════
     CANVAS RENDERING – FILE TAB (right pane)
  ═══════════════════════════════════════════════ */

export function renderExtractedCanvases() {
  rpWS.innerHTML = "";
  if (!state.curExtracted) return;

  // Both tiers split the same way, only the budget differs. Paid used to be
  // a single unbounded canvas, which meant a long document arrived as one
  // wall of text with no word count and no way to work through it in pieces.
  const limit = state.isPaidAccount ? PAID_WORD_LIMIT : FREE_WORD_LIMIT;
  state.canvasTexts = splitIntoCanvases(state.curExtracted, limit);
  state.canvasLines = linesPerCanvas(state.canvasTexts, state.lines);
  state.canvasTexts.forEach((chunk, idx) => {
    const wc = chunk.split(/\s+/).filter(Boolean).length;
    const label =
      state.canvasTexts.length > 1
        ? `Part ${idx + 1} of ${state.canvasTexts.length}`
        : "";
    const wrap = document.createElement("div");
    wrap.className = "rp-canvas-wrap";
    wrap.innerHTML = `
        <div class="rp-page" style="position:relative;">
          ${label ? `<div class="rp-canvas-badge">${label}</div>` : ""}
          <button class="rp-copy-btn" title="Copy">${COPY_SVG}</button>
          <div class="rp-content" contenteditable="true" spellcheck="false"
               data-ph="Extracted body text will appear here…" data-idx="${idx}"></div>
          <div class="rp-canvas-wc">${wc.toLocaleString()} words</div>
        </div>`;
    rpWS.appendChild(wrap);
    const el = wrap.querySelector(".rp-content");
    el.textContent = chunk;
    el.addEventListener("input", onExtractedEdit);
    const copyBtn = wrap.querySelector(".rp-copy-btn");
    copyBtn.addEventListener("click", () =>
      doCopy(el.innerText || chunk, copyBtn, COPY_SVG),
    );
  });
  // New canvases mean the revision no longer lines up with them, so the
  // Revise tab starts again too - whichever tab is showing. Only rebuilding
  // it when the Revise tab was open left the old paste canvases on screen
  // after a Free/Paid switch, a re-extract or a new document, holding text
  // the app had already discarded, with Download enabled and doing nothing.
  renderInsertCanvases();
  updateRevisedWords();
  updateRevisedPreview();
  recombineBtn.disabled = state.canvasTexts.length <= 1;
}

function onExtractedEdit(e) {
  const idx = parseInt(e.target.dataset.idx, 10);
  state.canvasTexts[idx] = e.target.innerText || "";
  state.curExtracted = state.canvasTexts.join("\n\n\n\n");
}

/* ═══════════════════════════════════════════════
     CANVAS RENDERING – INSERT TAB (left pane)
  ═══════════════════════════════════════════════ */

export function renderInsertCanvases() {
  revisedWS.innerHTML = "";
  const count = state.canvasTexts.length || 1;
  state.revisedTexts = new Array(count).fill("");

  for (let idx = 0; idx < count; idx++) {
    const label = count > 1 ? `Part ${idx + 1} of ${count}` : "Revised Text";
    addInsertCanvas(idx, label, `⌘+V / Ctrl+V - Paste revised text for ${label}…`);
  }
  updateCanvasStatus();
}

/** One paste canvas on the Revise tab, with a header holding its label and
 *  how its text is being placed. */
export function addInsertCanvas(idx, label, placeholder, text = "") {
  const wrap = document.createElement("div");
  wrap.className = "hum-canvas-wrap";
  wrap.innerHTML = `
    <div class="hum-canvas-header">
      <span class="hum-canvas-label"></span>
      <span class="hum-canvas-status"></span>
    </div>
    <div class="humanized-page${text ? "" : " waiting"}">
      <div class="humanized-content" contenteditable="true" spellcheck="false"
           data-idx="${idx}"></div>
    </div>`;
  wrap.querySelector(".hum-canvas-label").textContent = label;
  revisedWS.appendChild(wrap);
  const el = wrap.querySelector(".humanized-content");
  el.dataset.ph = placeholder;
  el.textContent = text;
  el.addEventListener("input", () => onRevisedInput(idx, el, wrap));
  el.addEventListener("paste", () =>
    setTimeout(() => onRevisedInput(idx, el, wrap), 50),
  );
  return el;
}

export function onRevisedInput(idx, el, wrap) {
  const text = el.innerText || "";
  state.revisedTexts[idx] = text;
  const page = wrap.querySelector(".humanized-page");
  page.classList.toggle("waiting", !text.trim());
  updateRevisedWords();
  updateRevisedPreview();
}

const countWords = (t) => (t || "").split(/\s+/).filter(Boolean).length;
const plural = (n, w) => `${n.toLocaleString()} ${w}${n === 1 ? "" : "s"}`;

/** Say, on each paste canvas, whether its text goes back line by line or
 *  has to be matched by wording because its line count differs. */
function updateCanvasStatus(status = []) {
  const els = revisedWS.querySelectorAll(".hum-canvas-status");
  els.forEach((el, k) => {
    const st = status[k] || { mode: "empty" };
    const words = countWords(state.revisedTexts[k]);
    el.removeAttribute("title");
    if (st.mode === "position") {
      el.textContent = `${plural(words, "word")} · placed line by line`;
      el.className = "hum-canvas-status filled";
    } else if (st.mode === "wording") {
      el.textContent = `${st.got} of ${plural(st.expected, "line")} · matched by wording`;
      el.className = "hum-canvas-status partial";
      el.title =
        `This part has ${plural(st.got, "line")} but was copied as ` +
        `${plural(st.expected, "line")}, so its lines are matched to the ` +
        "document by their wording. With one line for each line copied, " +
        "every line goes back exactly where it came from.";
    } else {
      el.textContent = `~${plural(countWords(state.canvasTexts[k]), "word")} expected`;
      el.className = "hum-canvas-status";
    }
  });
}

export function updateRevisedWords() {
  const totalWc = state.revisedTexts
    .join(" ")
    .split(/\s+/)
    .filter(Boolean).length;
  if (state.canvasTexts.length > 1) {
    const filled = state.revisedTexts.filter((t) => t.trim().length > 0).length;
    revisedWords.textContent = `${filled} of ${state.canvasTexts.length} filled · ${totalWc.toLocaleString()} words`;
  } else {
    revisedWords.textContent = `${totalWc.toLocaleString()} words`;
  }
}

/* ═══════════════════════════════════════════════
     LIVE PARTIAL PREVIEW
  ═══════════════════════════════════════════════ */

export function updateRevisedPreview() {
  // The same placement the download handler writes, so the preview shows
  // exactly what the file will contain.
  const { placements, status } = placeRevision(
    state.canvasLines,
    state.revisedTexts,
  );
  updateCanvasStatus(status);

  const filledCount = state.revisedTexts.filter(
    (t) => t.trim().length > 0,
  ).length;
  const totalCount = state.revisedTexts.length;

  const emptyMsg =
    '<p style="color:#888;font-style:italic;">The document preview will appear here after you paste revised text on the left.</p>';

  if (!state.originalDocHtml || filledCount === 0) {
    revisedDocHtml.innerHTML = emptyMsg;
    // The notes page belongs to the document, not to the revision, so it
    // stays hidden until there is a preview for it to sit beneath.
    renderNotesPage(revisedDocNotesPage, revisedDocNotesHtml, "");
    downloadBtn.disabled = true;
    insertRpSub.textContent = "0 words";
    return;
  }

  const { html: newHtml } = buildRevisedHtml(state.originalDocHtml, placements);
  revisedDocHtml.innerHTML = newHtml;
  // Footnotes are carried through untouched: they were never part of the
  // extracted text, so nothing pasted on the left can revise them.
  renderNotesPage(
    revisedDocNotesPage,
    revisedDocNotesHtml,
    state.docNotesHtml,
  );

  const allFilled = filledCount === totalCount;
  downloadBtn.disabled = !allFilled;

  const docWc = (
    revisedDocHtml.innerText +
    " " +
    revisedDocNotesHtml.innerText
  )
    .split(/\s+/)
    .filter(Boolean).length;
  const partial = !allFilled
    ? ` · ${filledCount}/${totalCount} canvases filled`
    : "";
  insertRpSub.textContent = `${docWc.toLocaleString()} words${partial}`;
}
