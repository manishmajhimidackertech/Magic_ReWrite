// The real page in jsdom: Extract Highlighted on the File tab, and Refresh
// Locations on the Revise tab together with the copy of each canvas the app
// keeps when it is copied. One app for the file, as in app.test.mjs.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import mammoth from "mammoth";
import { startApp } from "./helpers/app.mjs";
import { buildDocx, heading, para, run, text } from "./helpers/docx.mjs";
import { ROOT } from "./helpers/roots.mjs";

const app = await startApp(ROOT);
const w = app.window;
// The copy button writes to the clipboard, which jsdom does not have.
Object.defineProperty(w.navigator, "clipboard", { value: { writeText: async () => {} }, configurable: true });

const HL = '<w:rPr><w:highlight w:val="yellow"/></w:rPr>';
const hl = (t) => run(t, HL);

const P = [
  "Tesco is the largest grocer in the United Kingdom.",
  "The discounters Aldi and Lidl keep growing their share.",
  "Clubcard data drives pricing and promotion decisions.",
  "Regulation on packaging adds cost across the supply chain.",
];
// Reworded so thoroughly that nothing can be matched by wording.
const R = ["Alpha bravo charlie.", "Delta echo foxtrot.", "Golf hotel india.", "Juliet kilo lima."];
const plainDoc = () => buildDocx(P.map((p) => text(p)).join(""));
// 4,096 extracted words: one canvas on Paid, five on Free.
const REFERENCE = fs.readFileSync(path.join(ROOT, "tests/scenarios/12-citations-and-references/input.docx"));

/** The File tab's canvases. */
const extracted = () => [...app.$("rpWS").querySelectorAll(".rp-content")];
const copyButtons = () => [...app.$("rpWS").querySelectorAll(".rp-copy-btn")];
/** Edit File-tab canvas `idx` as typing in it would. */
function edit(idx, value) {
  const el = extracted()[idx];
  el.textContent = value;
  el.dispatchEvent(new w.Event("input"));
}
/** Ctrl+C in File-tab canvas `idx` with `selected` selected. */
function ctrlC(idx, selected) {
  const real = w.getSelection;
  w.getSelection = () => ({ toString: () => selected });
  try {
    extracted()[idx].dispatchEvent(new w.Event("copy", { bubbles: true }));
  } finally {
    w.getSelection = real;
  }
}
const mode = (k = 0) => {
  const got = app.state.revisedTexts[k].split("\n").filter((l) => l.trim()).length;
  return got === app.state.canvasLines[k].length ? "position" : "wording";
};
async function downloaded() {
  const file = await app.download();
  return (await mammoth.extractRawText({ buffer: file.buf })).value.split("\n").filter(Boolean);
}
const previewed = () => [...app.$("humanizedDocHtml").querySelectorAll("p, li")].map((e) => e.textContent);

const cases = {
  "the two buttons carry their new names and keep their icons": async () => {
    const label = (id) => app.$(id).querySelector(".st").textContent.replace(/\s+/g, " ").trim();
    assert.equal(app.$("reextBtn").querySelector(".st").innerHTML.replace(/\s*<br\s*\/?>\s*/, " "), "Extract Highlighted");
    assert.equal(app.$("reextBtn").querySelector(".si").textContent, "⚡");
    assert.equal(app.$("refreshBtn").querySelector(".st").innerHTML.replace(/\s*<br\s*\/?>\s*/, " "), "Refresh Locations");
    assert.equal(app.$("recombineBtn"), null);
    assert.ok(!/Re-combine|Re-extract/.test(w.document.body.textContent));
    assert.ok(label("refreshBtn"));
  },

  "Refresh Locations is disabled until a document is open, and again once it is closed": async () => {
    assert.equal(app.$("refreshBtn").disabled, true);
    await app.open(await plainDoc(), "plain.docx");
    assert.equal(app.$("refreshBtn").disabled, false);
    app.close();
    assert.equal(app.$("refreshBtn").disabled, true);
    assert.deepEqual(app.state.copiedTexts, []);
  },

  "Extract Highlighted puts only the highlighted text on the canvases, and Download changes only that": async () => {
    const buf = await buildDocx(
      heading("Introduction") +
        para(run("Plain start. ") + hl("First highlighted sentence.") + run(" Plain middle. ") + hl("Second highlighted sentence.")) +
        text("A paragraph with nothing highlighted in it."),
    );
    await app.open(buf, "hl.docx");
    assert.match(extracted()[0].textContent, /Plain start/, "opening a document extracts all of it");
    app.click("reextBtn");
    await app.until("highlight extraction", () => /highlighted passage/.test(app.$("rpBadges").textContent));
    assert.equal(extracted().length, 1);
    assert.equal(extracted()[0].textContent, "First highlighted sentence.\nSecond highlighted sentence.");
    assert.match(app.$("rpBadges").textContent, /2 highlighted passages/);
    assert.match(app.$("rpTitle").textContent, /6 words/);
    // The highlighting shows in the document pane.
    assert.equal(app.$("docHTML").querySelectorAll("mark").length, 2);

    app.click("insertTab");
    app.paste(0, "FIRST revised.\nSECOND revised.");
    const want = ["Plain start. FIRST revised. Plain middle. SECOND revised.", "A paragraph with nothing highlighted in it."];
    assert.deepEqual(previewed(), want);
    assert.deepEqual(await downloaded(), ["Introduction", ...want]);
  },

  "Extract Highlighted on a document with nothing highlighted keeps the extraction, and what was pasted, and says so": async () => {
    await app.open(await plainDoc(), "plain.docx");
    const before = extracted()[0].textContent;
    app.click("insertTab");
    app.paste(0, R.join("\n"));
    app.click("fileTab");
    app.click("reextBtn");
    await app.until("the notice", () => /No highlighted text found/.test(app.$("rpBadges").textContent));
    await app.until("loading to end", () => app.$("loadOv").style.display === "none");
    assert.equal(extracted()[0].textContent, before);
    assert.match(app.$("rpBadges").textContent, /4 paragraphs/, "the badges are still there");
    assert.equal(app.state.revisedTexts[0], R.join("\n"));
    assert.equal(app.$("downloadHumanizedBtn").disabled, false);
  },

  "a line deleted on the File tab without copying: stale until Refresh Locations, right after it": async () => {
    await app.open(await plainDoc(), "plain.docx");
    edit(0, [P[0], P[2], P[3]].join("\n"));
    app.click("insertTab");
    app.paste(0, [R[0], R[2], R[3]].join("\n"));
    assert.equal(mode(), "wording", "three lines against four extracted");
    app.click("refreshBtn");
    assert.equal(mode(), "position");
    const want = [R[0], P[1], R[2], R[3]];
    assert.deepEqual(previewed(), want);
    assert.deepEqual(await downloaded(), want);
  },

  "copying with the copy button after an edit updates the locations by itself": async () => {
    await app.open(await plainDoc(), "plain.docx");
    edit(0, [P[0], P[1], P[3]].join("\n"));
    copyButtons()[0].click();
    assert.equal(app.state.copiedTexts[0], [P[0], P[1], P[3]].join("\n"));
    app.click("insertTab");
    app.paste(0, [R[0], R[1], R[3]].join("\n"));
    assert.equal(mode(), "position");
    assert.deepEqual(await downloaded(), [R[0], R[1], P[2], R[3]]);
  },

  "the canvas edited again after it was copied: Refresh goes by what was copied": async () => {
    await app.open(await plainDoc(), "plain.docx");
    edit(0, [P[0], P[2], P[3]].join("\n"));
    copyButtons()[0].click();
    // After copying, the user tidies the canvas further. None of this went
    // out to be revised.
    edit(0, P[3]);
    app.click("insertTab");
    app.paste(0, [R[0], R[2], R[3]].join("\n"));
    app.click("refreshBtn");
    assert.equal(mode(), "position");
    assert.deepEqual(await downloaded(), [R[0], P[1], R[2], R[3]]);
  },

  "Ctrl+C of a whole canvas is remembered; a word or a sentence copied out of it is not": async () => {
    await app.open(await plainDoc(), "plain.docx");
    ctrlC(0, "largest grocer");
    assert.equal(app.state.copiedTexts[0], null);
    ctrlC(0, P[1]);
    assert.equal(app.state.copiedTexts[0], null, "one whole line is still not the canvas");
    edit(0, [P[0], P[1], P[2]].join("\n"));
    ctrlC(0, [P[0], P[1], P[2]].join("\n"));
    assert.equal(app.state.copiedTexts[0], [P[0], P[1], P[2]].join("\n"));
    assert.equal(app.state.canvasLines[0].length, 3);
  },

  "Refresh with nothing copied and nothing edited changes nothing": async () => {
    await app.open(await plainDoc(), "plain.docx");
    app.click("insertTab");
    app.paste(0, R.join("\n"));
    const before = { lines: app.state.canvasLines, file: await downloaded(), preview: previewed() };
    app.click("refreshBtn");
    assert.deepEqual(app.state.canvasLines, before.lines);
    assert.deepEqual(previewed(), before.preview);
    // Download re-enables itself a little after a download.
    await app.until("Download to be ready again", () => !app.$("downloadHumanizedBtn").disabled);
    assert.deepEqual(await downloaded(), before.file);
    assert.deepEqual(before.file, R);
  },

  "Refresh keeps what is pasted on the Revise tab, and pressing it twice is the same as once": async () => {
    await app.open(await plainDoc(), "plain.docx");
    edit(0, [P[1], P[2]].join("\n"));
    app.click("insertTab");
    app.paste(0, [R[1], R[2]].join("\n"));
    app.click("refreshBtn");
    const once = { lines: app.state.canvasLines, preview: previewed() };
    app.click("refreshBtn");
    assert.deepEqual(app.state.canvasLines, once.lines);
    assert.deepEqual(previewed(), once.preview);
    assert.deepEqual(previewed(), [P[0], R[1], R[2], P[3]]);
    assert.equal(app.canvases()[0].textContent, [R[1], R[2]].join("\n"));
    assert.equal(app.state.revisedTexts[0], [R[1], R[2]].join("\n"));
    assert.equal(app.$("downloadHumanizedBtn").disabled, false);
  },

  "Refresh before anything is pasted leaves the Revise tab empty and Download off": async () => {
    await app.open(await plainDoc(), "plain.docx");
    edit(0, [P[0], P[1]].join("\n"));
    app.click("insertTab");
    app.click("refreshBtn");
    assert.equal(app.state.canvasLines[0].length, 2);
    assert.equal(app.$("downloadHumanizedBtn").disabled, true);
    assert.match(app.$("humanizedDocHtml").textContent, /The document preview will appear here/);
  },

  "several parts, only some of them copied: Refresh uses the copy where there is one and the canvas where there is not": async () => {
    app.click("freeAcctBtn");
    try {
      await app.open(REFERENCE, "reference.docx");
      const parts = extracted().map((e) => e.textContent);
      assert.ok(parts.length >= 3, "the document splits into several parts");
      const linesOf = (t) => t.split("\n").filter((l) => l.trim());
      const base = app.state.baseCanvasLines.map((b) => b.length);

      // Part 1: its first line deleted, then copied.
      const part0 = linesOf(parts[0]).slice(1).join("\n");
      edit(0, part0);
      copyButtons()[0].click();
      // Part 2: its last line deleted, but never copied.
      const part1 = linesOf(parts[1]).slice(0, -1).join("\n");
      edit(1, part1);
      // Part 3 and on: untouched and never copied.
      assert.deepEqual(app.state.copiedTexts.map((t) => t !== null), parts.map((_, k) => k === 0));

      app.click("insertTab");
      app.click("refreshBtn");
      const now = app.state.canvasLines.map((l) => l.length);
      assert.deepEqual(now, base.map((n, k) => (k < 2 ? n - 1 : n)));
      // Each part's records are a run of its own extracted records, in order.
      app.state.canvasLines.forEach((recs, k) => {
        const own = app.state.baseCanvasLines[k];
        const want = k === 0 ? own.slice(1) : k === 1 ? own.slice(0, -1) : own;
        assert.deepEqual(recs.map((r) => [r.key, r.occ]), want.map((r) => [r.key, r.occ]));
      });
      // The parts left alone are placed by position as before.
      const sent = [part0, part1, ...parts.slice(2)];
      sent.forEach((t, k) => app.paste(k, linesOf(t).map((l, i) => `Revised part ${k} line ${i}.`).join("\n")));
      sent.forEach((_, k) => assert.equal(mode(k), "position"));
      assert.equal(app.$("downloadHumanizedBtn").disabled, false);
    } finally {
      app.click("paidAcctBtn");
    }
  },

  "new canvases forget what was copied from the old ones": async () => {
    await app.open(await plainDoc(), "plain.docx");
    edit(0, [P[2], P[3]].join("\n"));
    copyButtons()[0].click();
    assert.notEqual(app.state.copiedTexts[0], null);
    // Free and back: the canvases are made again, from the text as edited.
    app.click("freeAcctBtn");
    app.click("paidAcctBtn");
    assert.deepEqual(app.state.copiedTexts, [null]);
    assert.equal(extracted()[0].textContent, [P[2], P[3]].join("\n"));
    // Its two lines are still the third and fourth paragraphs, not the
    // first two records handed out in order.
    app.click("insertTab");
    app.paste(0, [R[2], R[3]].join("\n"));
    assert.deepEqual(previewed(), [P[0], P[1], R[2], R[3]]);
    app.click("fileTab");
    // And a newly opened document starts with none.
    copyButtons()[0].click();
    await app.open(await plainDoc(), "again.docx");
    assert.deepEqual(app.state.copiedTexts, [null]);
  },

  "highlighted passages: one deleted before copying, the rest go back to their own passages": async () => {
    const buf = await buildDocx(
      para(hl("Passage one is here.") + run(" Plain. ") + hl("Passage two is here.") + run(" Plain. ") + hl("Passage three is here.")),
    );
    await app.open(buf, "hl.docx");
    app.click("reextBtn");
    await app.until("highlight extraction", () => /highlighted passage/.test(app.$("rpBadges").textContent));
    edit(0, "Passage one is here.\nPassage three is here.");
    copyButtons()[0].click();
    app.click("insertTab");
    app.paste(0, "Alpha bravo.\nCharlie delta.");
    assert.equal(mode(), "position");
    const want = ["Alpha bravo. Plain. Passage two is here. Plain. Charlie delta."];
    assert.deepEqual(previewed(), want);
    assert.deepEqual(await downloaded(), want);
  },
};

for (const [name, run] of Object.entries(cases)) {
  test(name, async () => {
    app.close();
    await new Promise((r) => setTimeout(r, 0));
    await run();
  });
}

test("the page raised no script errors", () => {
  if (app.errors.length) throw app.errors[0];
  assert.deepEqual(app.logged, []);
});
