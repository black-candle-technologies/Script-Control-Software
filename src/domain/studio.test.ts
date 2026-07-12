import assert from "node:assert/strict";
import test from "node:test";
import { parseFountain } from "./fountain.ts";
import { buildStructure, compareDrafts, compileBreakdown, detectObjects, moveScene, toFdx } from "./studio.ts";

const document = parseFountain(`Title: Test\n\nINT. GARAGE - NIGHT\n\nMara grabs a gun and phone beside the car.\n\nMARA\nHello.\n\n[[Escape before dawn]]\n\nEXT. ROAD - DAY\n\nThe car crashes.\n`);

test("recognition and compiler derive production data from screenplay blocks", () => {
  const objects = detectObjects(document.blocks);
  assert.deepEqual(objects.map((object) => object.name), ["CAR", "GUN", "PHONE"]);
  const report = compileBreakdown(document.blocks);
  assert.equal(report.scenes, 2);
  assert.equal(report.nightScenes, 1);
  assert.equal(report.categories.weapons, 1);
  assert.equal(report.categories.vehicles, 2);
  assert.equal(report.categories.stunts, 1);
});

test("hierarchy places scenes into sequences and notes into beats", () => {
  const structure = buildStructure(document.blocks);
  assert.equal(structure.acts[0].sequences[0].sceneIds.length, 2);
  assert.equal(structure.beats[0].text, "Escape before dawn");
});

test("draft comparison is scene-aware", () => {
  const changed = parseFountain(`INT. GARAGE - NIGHT\n\nChanged action.\n\nEXT. FIELD - DAY\n\nNew.\n`);
  const diff = compareDrafts(document, changed);
  assert.ok(diff.some((change) => change.kind === "edited"));
  assert.ok(diff.some((change) => change.kind === "removed"));
  assert.ok(diff.some((change) => change.kind === "added"));
});

test("FDX export escapes XML and emits screenplay paragraph types", () => {
  document.blocks[1].text = "A & B < C";
  const xml = toFdx(document);
  assert.match(xml, /Type="Action"/);
  assert.match(xml, /<TitlePage>/);
  assert.match(xml, /A &amp; B &lt; C/);
  assert.match(xml, /<\/FinalDraft>\n$/);
});

test("scene-card moves keep each scene's blocks together", () => {
  const moved = moveScene(document.blocks, 1, 0);
  assert.match(moved[0].text, /EXT\. ROAD/);
  assert.equal(moved[1].text, "The car crashes.");
  assert.match(moved[2].text, /INT\. GARAGE/);
});
