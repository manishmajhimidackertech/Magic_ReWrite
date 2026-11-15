"use strict";

import {
  buildAlignmentMap,
  matchKey,
  tokenSet,
  tokenSimilarity,
} from "./alignment.js";
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
  // A highlighted passage: only that passage of its paragraph is replaced.
  if (rec.span != null) {
    if (!value) return;
    const loc = locationOf(rec.key, rec.occ);
    let placed = placements.get(loc);
    if (!placed || !placed.spans) placements.set(loc, (placed = { spans: new Map() }));
    placed.spans.set(rec.span, restoreCitations(value, rec.cites));
    return;
  }
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

/* ═══════════════════════════════════════════════
     REFRESHING LOCATIONS
     The line records are made when the text is
     extracted. A canvas on the File tab can be
     edited before it is copied - a line deleted, a
     sentence reworded - and the records then say
     what was extracted, not what was sent out to be
     revised. relocate() rebuilds a canvas's records
     from the text that actually went out.
  ═══════════════════════════════════════════════ */

const SAME_LINE = 0.5; // word overlap for an edited line to still be its original

/**
 * The line records for `text`, a canvas's text as it was copied, given the
 * records `base` the canvas was extracted with.
 *
 * Lines that are still word for word what was extracted keep their record.
 * Between those, lines are paired with the records left over: one for one
 * when there are as many of each (lines edited where they stand), otherwise
 * in order by the words they share. A line that is none of the extracted
 * lines gets a record with no location: it is counted, so the lines around
 * it still go back by position, and it is written nowhere. A record whose
 * line is gone is dropped, and its paragraph keeps its wording.
 *
 * @param {Array<object>} base
 * @param {string} text
 * @returns {Array<object>}
 */
export function relocate(base, text) {
  const lines = nonEmptyLines(text);
  if (!lines.length) return base;
  const baseText = base.map((r) => String(r.text).trim());

  // Longest common subsequence of exact lines: the anchors.
  const n = lines.length,
    m = base.length;
  const lcs = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      lcs[i][j] =
        lines[i] === baseText[j]
          ? lcs[i + 1][j + 1] + 1
          : Math.max(lcs[i + 1][j], lcs[i][j + 1]);

  const out = [];
  const unlocated = (line) => ({
    text: line,
    sep: "\n",
    key: "",
    occ: 0,
    cites: [],
    label: "",
    isList: false,
  });
  // Lines i0..i1 and records j0..j1 (exclusive ends) lie between two anchors.
  function gap(i0, i1, j0, j1) {
    if (i1 - i0 === j1 - j0) {
      for (let k = 0; k < i1 - i0; k++)
        out.push({ ...base[j0 + k], text: lines[i0 + k] });
      return;
    }
    let j = j0;
    for (let i = i0; i < i1; i++) {
      const set = tokenSet(lines[i]);
      let hit = -1;
      for (let x = j; x < j1 && hit < 0; x++)
        if (tokenSimilarity(set, tokenSet(baseText[x])) >= SAME_LINE) hit = x;
      if (hit < 0) out.push(unlocated(lines[i]));
      else {
        out.push({ ...base[hit], text: lines[i] });
        j = hit + 1;
      }
    }
  }

  let i = 0,
    j = 0,
    gi = 0,
    gj = 0;
  while (i < n && j < m) {
    if (lines[i] === baseText[j]) {
      gap(gi, i, gj, j);
      out.push(base[j]);
      i++;
      j++;
      gi = i;
      gj = j;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) i++;
    else j++;
  }
  gap(gi, n, gj, m);
  return out;
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
