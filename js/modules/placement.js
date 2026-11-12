"use strict";

import { buildAlignmentMap, matchKey } from "./alignment.js";
import { restoreCitations } from "./citations.js";
import { LIST_PREFIX_RE } from "./constants.js";

/* ═══════════════════════════════════════════════
     PLACING THE REVISION
     Every line on the File tab knows the paragraph
     it was copied from. A revised canvas with the
     same number of lines as the one it was copied
     from is placed line by line, by position: no
     wording is compared. Only a canvas whose line
     count differs falls back to matching by words.
  ═══════════════════════════════════════════════ */

/** The id the writer and the preview look a paragraph up by: its text as
 *  matchKey reads it, and how many paragraphs before it share that text. */
export const locationOf = (key, occ) => key + "\u0000" + occ;

const nonEmptyLines = (t) =>
  String(t || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Record `revisedLine` as the new text of the paragraph `rec` came from. */
function place(placements, rec, revisedLine) {
  if (!rec.key) return; // table text: offered for context, never written
  let value = String(revisedLine || "").trim();
  if (rec.isList) value = value.replace(LIST_PREFIX_RE, "").trim();
  // A "Label: body" paragraph keeps its label; the rewriter may have kept
  // it, dropped it or changed its case, so only the body is taken.
  if (rec.label)
    value = value
      .replace(new RegExp("^" + escapeRe(rec.label) + "\\s*:\\s*", "i"), "")
      .trim();
  if (!value) return;
  placements.set(locationOf(rec.key, rec.occ), {
    value: restoreCitations(value, rec.cites),
    label: rec.label || "",
  });
}

/**
 * Match the canvases that could not be placed by position, by wording,
 * against every line that has not been placed yet. Pooling them keeps a
 * revision pasted into the wrong canvas from being lost.
 */
function placeByWording(placements, canvasLines, revisedTexts, pending, open) {
  const recs = [];
  const blockOf = [];
  let text = "";
  let block = -1;
  for (const k of open) {
    canvasLines[k].forEach((rec, i) => {
      const sep = i === 0 ? "\n\n\n\n" : rec.sep;
      if (sep === "\n\n\n\n") block++;
      text += (text ? sep : "") + rec.text;
      recs.push(rec);
      blockOf.push(block);
    });
  }
  const paras = pending
    .map((k) => revisedTexts[k] || "")
    .join("\n\n\n\n")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (!text || !paras.length) return;

  const { lineMapping } = buildAlignmentMap(text, paras);
  recs.forEach((rec, i) => {
    const candidates = lineMapping.get(matchKey(rec.text));
    if (!candidates || !candidates.length) return;
    const c =
      candidates.find((x) => x.extIdx === blockOf[i]) || candidates[0];
    place(placements, rec, c.value);
  });
}

/**
 * @param {Array<Array<object>>} canvasLines - line records per canvas
 * @param {string[]} revisedTexts            - pasted text per canvas
 * @returns {{ placements: Map<string, {value: string, label: string}>,
 *             status: Array<{mode: "empty"|"position"|"wording",
 *                            expected: number, got: number}> }}
 */
export function placeRevision(canvasLines, revisedTexts) {
  const placements = new Map();
  const status = [];
  const pending = [];
  const open = [];
  canvasLines.forEach((recs, k) => {
    const got = nonEmptyLines(revisedTexts[k]);
    const expected = recs.length;
    if (!got.length) {
      status.push({ mode: "empty", expected, got: 0 });
      open.push(k);
    } else if (got.length === expected) {
      recs.forEach((rec, i) => place(placements, rec, got[i]));
      status.push({ mode: "position", expected, got: got.length });
    } else {
      status.push({ mode: "wording", expected, got: got.length });
      pending.push(k);
      open.push(k);
    }
  });
  if (pending.length)
    placeByWording(placements, canvasLines, revisedTexts, pending, open);
  return { placements, status };
}
