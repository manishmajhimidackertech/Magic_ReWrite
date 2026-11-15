"use strict";

/* ═══════════════════════════════════════════════
     HIGHLIGHTED PASSAGES
     A paragraph is read three times - from mammoth's
     document when extracting, from mammoth's HTML for
     the preview and from document.xml when writing -
     and each reading has to find the same passages,
     because a passage is known only by its paragraph
     and its number within it. So all three hand their
     pieces of text here to be grouped.
  ═══════════════════════════════════════════════ */

/** How mammoth is told to keep highlighting in its HTML, which the preview
 *  needs in order to see where a passage is. */
export const HIGHLIGHT_STYLE_MAP = ["highlight => mark"];

/**
 * Group a paragraph's pieces of text into highlighted passages.
 *
 * A passage runs from one highlighted piece to the last highlighted piece
 * that follows it with nothing but whitespace in between. Word often puts
 * the space between two highlighted words in a run of its own, without the
 * highlight; that space is part of the passage, not the end of it. Pieces
 * with no text at all (field codes, a footnote reference) are passed over.
 * A passage of nothing but whitespace is not one.
 *
 * @param {Array<{text: string, hl: boolean}>} pieces - in document order
 * @returns {Array<{from: number, to: number, text: string}>} - `from` and
 *          `to` index `pieces`, both inclusive
 */
export function groupHighlighted(pieces) {
  const spans = [];
  let cur = null;
  pieces.forEach((p, i) => {
    if (!p.text) return;
    if (p.hl) {
      if (!cur) spans.push((cur = { from: i, to: i }));
      else cur.to = i;
    } else if (/\S/.test(p.text)) {
      cur = null;
    }
  });
  for (const s of spans)
    s.text = pieces
      .slice(s.from, s.to + 1)
      .map((p) => p.text)
      .join("");
  return spans.filter((s) => /\S/.test(s.text));
}

/** The whitespace a passage starts and ends with. A revision is trimmed, so
 *  this is put back around it for the passage to still sit apart from the
 *  words on either side. */
export function edgeSpace(text) {
  return { lead: text.match(/^\s*/)[0], trail: text.match(/\s*$/)[0] };
}
