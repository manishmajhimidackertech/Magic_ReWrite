"use strict";

/* ═══════════════════════════════════════════════
     APPLICATION STATE
     Single shared object so every module can read
     and write the same instance without circular
     imports on individual variables.
  ═══════════════════════════════════════════════ */
export const state = {
  curFile:       null,
  curExtracted:  "",          // full extracted text (ground truth)
  lines:         [],          // one record per extracted line: where it came from
  originalDocHtml: "",        // mammoth HTML of the original docx, notes removed
  docNotesHtml:  "",          // trailing footnote/endnote <ol>(s), rendered on their own page
  insertMode:    false,
  isPaidAccount: true,        // paid (default) vs free - controls canvas size
  canvasTexts:   [],          // extracted text per canvas
  canvasLines:   [],          // the line records in each canvas (parallel)
  revisedTexts: [],         // revised text per canvas (parallel)
};
