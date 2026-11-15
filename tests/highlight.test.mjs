// Extract Highlighted: only the highlighted passages of a document are
// extracted, and only those passages are rewritten when the revision comes
// back - in the downloaded file and in the preview alike.
import "./helpers/dom.mjs";
import assert from "node:assert/strict";
import { test } from "node:test";
import JSZip from "jszip";
import mammoth from "mammoth";
import { buildDocx, heading, para, run, table, text, xmlErrors, LINK_REL } from "./helpers/docx.mjs";
import { ROOT, loadModules } from "./helpers/roots.mjs";
import { pathToFileURL } from "node:url";
import path from "node:path";

const mods = await loadModules(ROOT);
const hlMod = await import(pathToFileURL(path.join(ROOT, "js/modules/highlight.js")).href);

const HL = '<w:rPr><w:highlight w:val="yellow"/></w:rPr>';
const hl = (t) => run(t, HL);

/** Open a document as Extract Highlighted does. */
async function open(bodyXml) {
  const buf = await buildDocx(bodyXml);
  const elems = [];
  const { value: html } = await mammoth.convertToHtml(
    { buffer: buf },
    { transformDocument: mods.helpers.collectElems(elems), styleMap: hlMod.HIGHLIGHT_STYLE_MAP },
  );
  return { buf, html, ...mods.extractor.processHighlights(elems) };
}

const placements = (doc, revised) =>
  mods.placement.placeRevision([doc.lines], [revised]).placements;

/** The downloaded document's paragraphs, and the preview's text. */
async function roundTrip(doc, revised) {
  const zip = await JSZip.loadAsync(doc.buf);
  const inputXml = await zip.file("word/document.xml").async("string");
  const p = placements(doc, revised);
  const xml = mods.writer.patchDocumentXml(inputXml, p);
  assert.deepEqual(xmlErrors(xml), []);
  zip.file("word/document.xml", xml);
  const out = await zip.generateAsync({ type: "nodebuffer" });
  const paras = (await mammoth.extractRawText({ buffer: out })).value.split("\n").filter(Boolean);
  const { html } = mods.preview.buildRevisedHtml(doc.html, p);
  const body = new DOMParser().parseFromString(html, "text/html").body;
  const preview = [...body.querySelectorAll("p, li, h1")].map((e) => e.textContent);
  return { xml, inputXml, paras, preview };
}

test("only highlighted text is extracted, one line for each passage", async () => {
  const doc = await open(
    para(run("Plain start. ") + hl("First highlighted sentence.") + run(" Plain middle. ") + hl("Second highlighted sentence.")) +
      text("A paragraph with nothing highlighted.") +
      para(hl("A paragraph highlighted from end to end.")),
  );
  assert.equal(
    doc.out,
    "First highlighted sentence.\nSecond highlighted sentence.\nA paragraph highlighted from end to end.",
  );
  assert.deepEqual(doc.lines.map((l) => l.span), [0, 1, 0]);
  assert.match(doc.pills[0].label, /^3 highlighted passages$/);
});

test("a document with nothing highlighted extracts nothing", async () => {
  const doc = await open(text("Nothing here is highlighted.") + text("Nor here."));
  assert.equal(doc.out, "");
  assert.deepEqual(doc.lines, []);
});

test('highlight "none" is not highlighting', async () => {
  const doc = await open(para(run("Cleared highlight.", '<w:rPr><w:highlight w:val="none"/></w:rPr>') + hl(" Real one.")));
  assert.equal(doc.out, "Real one.");
});

test("a revised passage replaces that passage and nothing else in its paragraph", async () => {
  const doc = await open(
    para(run("Plain start. ") + hl("First highlighted sentence.") + run(" Plain middle. ") + hl("Second highlighted sentence.")) +
      text("A paragraph with nothing highlighted."),
  );
  const { paras, preview, xml } = await roundTrip(doc, "FIRST revised.\nSECOND revised.");
  const want = [
    "Plain start. FIRST revised. Plain middle. SECOND revised.",
    "A paragraph with nothing highlighted.",
  ];
  assert.deepEqual(paras, want);
  assert.deepEqual(preview, want);
  // The revision is still highlighted, and the plain runs are byte for byte.
  assert.match(xml, /<w:highlight w:val="yellow"\/><\/w:rPr><w:t xml:space="preserve">FIRST revised\.<\/w:t>/);
  assert.ok(xml.includes(run("Plain start. ")) && xml.includes(run(" Plain middle. ")));
});

test("one passage revised and the other left empty changes only the one", async () => {
  const doc = await open(
    para(hl("Tesco competes with four large rivals.") + run(" plain ") + hl("Margins across the grocery sector are thin.")),
  );
  // Line count differs from what was copied, so it is matched by wording.
  const { paras, preview } = await roundTrip(doc, "Across the grocery sector, margins are very thin.");
  assert.deepEqual(paras, ["Tesco competes with four large rivals. plain Across the grocery sector, margins are very thin."]);
  assert.deepEqual(preview, paras);
});

test("highlighted words split across runs, with plain spaces between, are one passage", async () => {
  const doc = await open(
    para(run("Before ") + hl("three") + run(" ") + hl("highlighted") + run(" ") + hl("words") + run(" after.")),
  );
  assert.equal(doc.out, "three highlighted words");
  const { paras, preview } = await roundTrip(doc, "just two");
  assert.deepEqual(paras, ["Before just two after."]);
  assert.deepEqual(preview, paras);
});

test("the space a passage begins or ends with is kept around its revision", async () => {
  const doc = await open(para(run("Plain.") + hl(" Highlighted with a leading space. ") + run("Plain again.")));
  assert.equal(doc.out, "Highlighted with a leading space.");
  const { paras, preview } = await roundTrip(doc, "Revised.");
  assert.deepEqual(paras, ["Plain. Revised. Plain again."]);
  assert.deepEqual(preview, paras);
});

test("the same paragraph twice: each copy's passage goes to its own paragraph", async () => {
  const twin = para(run("Same words. ") + hl("Same highlight."));
  const doc = await open(twin + text("Between.") + twin);
  assert.equal(doc.out, "Same highlight.\nSame highlight.");
  const { paras, preview } = await roundTrip(doc, "First copy.\nSecond copy.");
  assert.deepEqual(paras, ["Same words. First copy.", "Between.", "Same words. Second copy."]);
  assert.deepEqual(preview, paras);
});

test("a highlighted heading and highlighted table text are left out, and are not written", async () => {
  const doc = await open(
    para(hl("A Highlighted Heading"), "Heading1") +
      table([[para(hl("Highlighted cell."))]]) +
      para(hl("Highlighted body.")),
  );
  assert.equal(doc.out, "Highlighted body.");
  const { paras } = await roundTrip(doc, "Revised body.");
  assert.deepEqual(paras, ["A Highlighted Heading", "Highlighted cell.", "Revised body."]);
});

test("a citation in a passage is held back and restored; a passage that is only a citation gives no line", async () => {
  const doc = await open(
    para(hl("Margins are thin in the sector") + hl(" (Smith, 2020)") + run(". Plain claim") + hl(" (Jones, 2021)") + run(".")),
  );
  assert.equal(doc.out, "Margins are thin in the sector");
  const { paras, preview } = await roundTrip(doc, "The sector has thin margins");
  assert.deepEqual(paras, ["The sector has thin margins (Smith, 2020). Plain claim (Jones, 2021)."]);
  assert.deepEqual(preview, paras);
});

test("a passage inside a hyperlink is replaced inside the hyperlink", async () => {
  const doc = await open(
    para(run("See ") + `<w:hyperlink r:id="${LINK_REL}">${hl("the linked source")}</w:hyperlink>` + run(" for more.")),
  );
  assert.equal(doc.out, "the linked source");
  const { paras, xml } = await roundTrip(doc, "this link");
  assert.deepEqual(paras, ["See this link for more."]);
  assert.match(xml, /<w:hyperlink r:id="[^"]+"><w:r><w:rPr><w:highlight w:val="yellow"\/><\/w:rPr><w:t xml:space="preserve">this link<\/w:t><\/w:r><\/w:hyperlink>/);
});

test("a footnote reference inside a passage survives the rewrite", async () => {
  const ref = '<w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:footnoteRef/></w:r>';
  const doc = await open(para(hl("Claim part one") + ref + hl(" and part two.") + run(" Plain.")));
  assert.equal(doc.out, "Claim part one and part two.");
  const { xml, paras } = await roundTrip(doc, "A reworded claim.");
  assert.deepEqual(paras, ["A reworded claim. Plain."]);
  assert.ok(xml.includes(ref));
});

test("sections are separated, so canvases can be cut between them", async () => {
  const doc = await open(heading("One") + para(hl("First.")) + heading("Two") + para(hl("Second.")));
  assert.equal(doc.out, "First.\n\n\n\nSecond.");
  assert.equal(mods.extractor.linesPerCanvas([doc.out], doc.lines)[0].length, 2);
});

test("the whole-document extraction is unchanged by highlighting", async () => {
  const body = para(run("Plain start. ") + hl("Highlighted sentence.")) + text("Second paragraph.");
  const buf = await buildDocx(body);
  const elems = [];
  await mammoth.convertToHtml({ buffer: buf }, { transformDocument: mods.helpers.collectElems(elems) });
  const full = mods.extractor.processElements(elems);
  assert.equal(full.out, "Plain start. Highlighted sentence.\nSecond paragraph.");
  assert.ok(full.lines.every((l) => l.span === undefined));
});
