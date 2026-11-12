"use strict";

import { matchKey } from "./alignment.js";
import { locationOf } from "./placement.js";

/* ═══════════════════════════════════════════════
     LIVE PARTIAL PREVIEW
     Writes the placed revision into mammoth's HTML
     of the original. Paragraphs with nothing placed
     yet stay as they are, so a half-filled Revise
     tab previews correctly.
  ═══════════════════════════════════════════════ */

/** Collect every descendant text node of `el`, in document order, without
 *  descending into footnote/endnote reference anchors (their visible
 *  "[N]" marker text must never be overwritten or blanked). */
function collectTextNodes(el, out) {
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      out.push(node);
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      // A nested list is the next paragraphs, not part of this one.
      if (
        node.matches &&
        node.matches('a[href^="#footnote"], a[href^="#endnote"], ul, ol')
      )
        continue;
      collectTextNodes(node, out);
    }
  }
  return out;
}

/** Replace the text content of an element without touching child element nodes.
 *
 * Text nodes are gathered recursively (not just direct children of `el`),
 * because a short, single-sentence paragraph is often wrapped entirely in
 * one inline element by mammoth (e.g. `<p><strong>…</strong></p>` for a
 * fully-bold question/heading-like sentence). Direct-children-only lookup
 * finds no text node in that case and falls into the "insert new text
 * node" branch below - which left the ORIGINAL text sitting untouched
 * inside <strong> while inserting the revised text as a sibling, so both
 * the original and the revised sentence rendered side by side. Searching
 * recursively finds the real text node (inside <strong>) and updates it
 * in place instead. */
export function replaceTextOnly(el, newText) {
  const tnodes = collectTextNodes(el, []);
  if (!tnodes.length) {
    el.insertBefore(el.ownerDocument.createTextNode(newText), el.firstChild);
    return;
  }
  tnodes[0].nodeValue = newText;
  for (let i = 1; i < tnodes.length; i++) tnodes[i].nodeValue = "";
}

/**
 * Produce a new HTML string by replacing the paragraphs that have a placed
 * revision. Paragraphs are found by location - their text and how many
 * before them share it - exactly as the writer finds them in document.xml.
 *
 * @param {string} originalHtml - mammoth HTML of the original docx
 * @param {Map}    placements   - from placeRevision(): location → {value, label}
 * @returns {{ html: string }}  - patched inner HTML
 */
export function buildRevisedHtml(originalHtml, placements) {
  if (!placements || !placements.size) return { html: originalHtml };

  const seen = new Map();

  /** Text used for locating the paragraph - excludes footnote/endnote
   *  reference markers (mammoth renders these as an inline
   *  <sup><a href="#footnote-N">[N]</a></sup>, whose visible "[N]" text was
   *  never part of the extracted text) and a list item's nested list, which
   *  is its own paragraphs. */
  function matchText(el) {
    const clone = el.cloneNode(true);
    for (const a of clone.querySelectorAll(
      'a[href^="#footnote"], a[href^="#endnote"]',
    )) {
      const sup = a.closest("sup") || a;
      sup.remove();
    }
    for (const list of clone.querySelectorAll("ul, ol")) list.remove();
    // A soft line break is a space in the extracted text (see gtxt), but
    // contributes nothing to textContent.
    for (const br of clone.querySelectorAll("br"))
      br.replaceWith(clone.ownerDocument.createTextNode(" "));
    return clone.textContent.trim();
  }

  const esc = (t) =>
    t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  function walkNode(el) {
    const tag = el.tagName ? el.tagName.toLowerCase() : "";
    if (tag === "table") return;
    if (/^h[1-6]$/.test(tag) || tag === "p" || tag === "li") {
      // Headings are counted, as the extractor and the writer count them,
      // but never revised.
      const key = matchKey(matchText(el));
      if (key) {
        const occ = seen.get(key) || 0;
        seen.set(key, occ + 1);
        const placed =
          tag[0] === "h" ? null : placements.get(locationOf(key, occ));
        if (placed && placed.label)
          el.innerHTML = `<strong>${esc(placed.label)}:</strong> ${esc(placed.value)}`;
        else if (placed) replaceTextOnly(el, placed.value);
      }
      if (tag === "li")
        for (const child of el.children)
          if (/^(ul|ol)$/i.test(child.tagName)) walkNode(child);
      return;
    }
    for (const child of el.children) walkNode(child);
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(originalHtml, "text/html");
  for (const child of doc.body.children) walkNode(child);
  return { html: doc.body.innerHTML };
}
