// Which parentheticals count as citations: held back when the text is
// extracted, put back when the revision is placed.
import "./helpers/dom.mjs";
import assert from "node:assert/strict";
import { test } from "node:test";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ROOT, loadModules } from "./helpers/roots.mjs";
import { buildDocx, download, open, text } from "./helpers/docx.mjs";

const mods = await loadModules(ROOT);
const { stripCitations, restoreCitations } = await import(
  pathToFileURL(path.join(ROOT, "js/modules/citations.js")).href
);

const HELD = [
  "(Smith 2020)",
  "(Smith, 2020)",
  "(OAIC 2025a)",
  "(Smith & Jones, 2019; Lee et al., 2021)",
  "(O'Brien, 2018)",
  "(Gutiérrez-Broncano et al., 2024)",
  "(Müller & Çelik, 2020)",
  "(Åkesson 2017)",
  "(Which?, 2024)",
  "(Yahoo!, 2019)",
  "(Иванов, 2021)",
  "[3]",
  "[1, 2]",
  "[4-6]",
];
for (const marker of HELD)
  test(`${marker} is held back and restored`, () => {
    const original = `The claim stands ${marker}. A second sentence follows.`;
    const { text: stripped, cites } = stripCitations(original);
    assert.equal(stripped, "The claim stands. A second sentence follows.");
    assert.deepEqual(cites.map((c) => c.marker), [marker]);
    assert.equal(restoreCitations("A reworded claim. Then another.", cites), `A reworded claim ${marker}. Then another.`);
  });

const KEPT = [
  "(Schedule 2, to be in force from 10 June 2025)",
  "(see Smith 2020)",
  "(émigré writers after 1945)",
  "(is this still true in 2024?)",
  "(approximately 2020 units)",
  "[2022]",
  "(Smith)",
];
for (const aside of KEPT)
  test(`${aside} is not a citation and stays in the text`, () => {
    const original = `Text ${aside} more.`;
    const { text: stripped, cites } = stripCitations(original);
    assert.equal(stripped, original);
    assert.deepEqual(cites, []);
  });

test("a paragraph citing an accented author and a name with '?' is revised with both citations restored", async () => {
  const P1 = "Hybrid strategies need not be in this danger (Gutiérrez-Broncano et al., 2024).";
  const P2 = "Regulatory risks may not be given the same weight (Which?, 2024).";
  const doc = await open(mods, await buildDocx(text(P1) + text(P2)));
  assert.equal(doc.out, "Hybrid strategies need not be in this danger.\nRegulatory risks may not be given the same weight.");
  const out = await download(mods, doc, "A hybrid approach avoids that trap.\nRisk from regulation is underweighted.");
  assert.deepEqual(out.errors, []);
  assert.deepEqual(out.text.split("\n").filter(Boolean), [
    "A hybrid approach avoids that trap (Gutiérrez-Broncano et al., 2024).",
    "Risk from regulation is underweighted (Which?, 2024).",
  ]);
});
