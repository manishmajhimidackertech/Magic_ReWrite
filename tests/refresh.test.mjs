// relocate(): rebuilding a canvas's line locations from the text that was
// actually copied out of it, which is what Refresh Locations does.
import "./helpers/dom.mjs";
import assert from "node:assert/strict";
import { test } from "node:test";
import { ROOT, loadModules } from "./helpers/roots.mjs";

const { placement } = await loadModules(ROOT);
const { relocate, placeRevision, locationOf } = placement;

const TEXTS = [
  "Tesco is the largest grocer in the United Kingdom.",
  "The discounters Aldi and Lidl keep growing their share.",
  "Clubcard data drives pricing and promotion decisions.",
  "Regulation on packaging adds cost across the supply chain.",
];
const rec = (text, i) => ({ text, sep: i ? "\n" : "", key: text.toLowerCase(), occ: 0, cites: [], label: "", isList: false });
const BASE = TEXTS.map(rec);
const keys = (recs) => recs.map((r) => r.key);

test("text that is still what was extracted keeps every record", () => {
  assert.deepEqual(relocate(BASE, TEXTS.join("\n")), BASE);
});

test("blank lines and stray spaces around lines change nothing", () => {
  assert.deepEqual(relocate(BASE, "\n  " + TEXTS.join("  \n\n\n ") + "\n"), BASE);
});

test("a deleted line drops its record and the rest keep theirs", () => {
  const out = relocate(BASE, [TEXTS[0], TEXTS[2], TEXTS[3]].join("\n"));
  assert.deepEqual(keys(out), [BASE[0].key, BASE[2].key, BASE[3].key]);
});

test("the first and the last line deleted", () => {
  const out = relocate(BASE, [TEXTS[1], TEXTS[2]].join("\n"));
  assert.deepEqual(keys(out), [BASE[1].key, BASE[2].key]);
});

test("a line reworded where it stands keeps its location and takes the new wording", () => {
  const out = relocate(BASE, [TEXTS[0], "Something else entirely now.", TEXTS[2], TEXTS[3]].join("\n"));
  assert.deepEqual(keys(out), keys(BASE));
  assert.equal(out[1].text, "Something else entirely now.");
  assert.equal(BASE[1].text, TEXTS[1], "the extracted records are not altered");
});

test("a line deleted and another lightly edited: the edited one is still found", () => {
  const edited = "The discounters Aldi and Lidl keep growing their market share quickly.";
  const out = relocate(BASE, [edited, TEXTS[2], TEXTS[3]].join("\n"));
  assert.deepEqual(keys(out), [BASE[1].key, BASE[2].key, BASE[3].key]);
});

test("a line typed in that was never extracted is counted but goes nowhere", () => {
  const out = relocate(BASE, [TEXTS[0], "Please keep the tone formal.", TEXTS[1], TEXTS[2], TEXTS[3]].join("\n"));
  assert.equal(out.length, 5);
  assert.equal(out[1].key, "");
  const revised = ["R0", "ignored", "R1", "R2", "R3"].join("\n");
  const { placements, status } = placeRevision([out], [revised]);
  assert.equal(status[0].mode, "position");
  assert.deepEqual([...placements.values()].map((p) => p.value), ["R0", "R1", "R2", "R3"]);
});

test("lines copied in a different order go back to their own paragraphs where they can", () => {
  const out = relocate(BASE, [TEXTS[1], TEXTS[0], TEXTS[2], TEXTS[3]].join("\n"));
  // No line is given another line's location.
  out.forEach((r) => r.key && assert.equal(r.key, r.text.toLowerCase()));
  assert.ok(out.length === 4);
});

test("an empty canvas leaves the extracted records in place", () => {
  assert.equal(relocate(BASE, ""), BASE);
  assert.equal(relocate(BASE, " \n\n "), BASE);
});

test("everything replaced by unrelated text: nothing is written anywhere", () => {
  const out = relocate(BASE, "Unrelated one.\nUnrelated two.");
  assert.deepEqual(keys(out), ["", ""]);
  assert.equal(placeRevision([out], ["X\nY"]).placements.size, 0);
});

test("duplicate lines keep their own occurrence", () => {
  const dup = [rec("Same line.", 0), rec("Middle.", 1), { ...rec("Same line.", 2), occ: 1 }];
  const out = relocate(dup, "Middle.\nSame line.");
  assert.deepEqual(out.map((r) => r.occ), [0, 1]);
  assert.equal(out[0].text, "Middle.");
});

test("a deleted line: placed by position after relocating, not before", () => {
  const copied = [TEXTS[0], TEXTS[2], TEXTS[3]].join("\n");
  // Reworded so thoroughly that no wording is shared with the originals.
  const revised = "Alpha bravo charlie.\nDelta echo foxtrot.\nGolf hotel india.";
  const stale = placeRevision([BASE], [revised]);
  assert.equal(stale.status[0].mode, "wording");
  const fresh = placeRevision([relocate(BASE, copied)], [revised]);
  assert.equal(fresh.status[0].mode, "position");
  assert.deepEqual(
    Object.fromEntries([...fresh.placements].map(([k, v]) => [k, v.value])),
    {
      [locationOf(BASE[0].key, 0)]: "Alpha bravo charlie.",
      [locationOf(BASE[2].key, 0)]: "Delta echo foxtrot.",
      [locationOf(BASE[3].key, 0)]: "Golf hotel india.",
    },
  );
});

test("highlighted passages keep their passage number through relocating", () => {
  const spans = [0, 1, 2].map((i) => ({ ...rec("Whole paragraph text.", 0), text: `Passage ${i} of the paragraph.`, span: i }));
  const out = relocate(spans, "Passage 0 of the paragraph.\nPassage 2 of the paragraph.");
  assert.deepEqual(out.map((r) => r.span), [0, 2]);
  const { placements } = placeRevision([out], ["New zero.\nNew two."]);
  assert.deepEqual([...placements.get(locationOf(spans[0].key, 0)).spans], [[0, "New zero."], [2, "New two."]]);
});
