import assert from "node:assert/strict";
import test from "node:test";
import { parseFountain } from "./fountain.ts";
import { emptyWorkspace, type ScreenplayDocument } from "./screenplay.ts";
import { buildStructure, compareDrafts, compileBreakdown, detectObjects, moveScene, toFdx, toFdxWithWarnings } from "./studio.ts";

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

test("FDX export preserves safe imported metadata, original types, scene numbers, and styled runs", () => {
  const imported: ScreenplayDocument = {
    metadata: { DocumentType: "Script", Version: "3", CustomRoot: "A&B" },
    titlePage: {
      title: "Imported & Title",
      author: "",
      blocks: [{ type: "Title", text: "Imported & Title", metadata: { Type: "Title", Page: "1&2" } }],
    },
    blocks: [
      {
        id: "scene-1",
        type: "scene_heading",
        text: "INT. A & B - DAY",
        originalType: "Scene Heading",
        metadata: { Type: "Scene Heading", Number: "12A", Id: "scene&1" },
      },
      {
        id: "custom-1",
        type: "unknown",
        text: "Bold < & underlined",
        originalType: "Montage & Beat",
        metadata: { Type: "Montage & Beat", Custom: "A \"quote\" & more" },
        textRuns: [
          { text: "Bold <", bold: true, italic: true, underline: false, strikeout: false, revisionId: "2&3", metadata: { Style: "Bold+Italic", RevisionID: "2&3" } },
          { text: " & underlined", bold: false, italic: false, underline: true, strikeout: true, metadata: { Style: "Underline+Strikeout" } },
        ],
      },
      { id: "empty-1", type: "action", text: "", originalType: "Action", metadata: { Type: "Action" } },
    ],
    sceneNotes: { "scene-1": "SCS-only scene note" },
    workspace: { ...emptyWorkspace(), treatment: "SCS-only treatment" },
  };

  const { xml, warnings } = toFdxWithWarnings(imported);
  assert.deepEqual(warnings, []);
  assert.match(xml, /CustomRoot="A&amp;B"/);
  assert.match(xml, /<Paragraph Type="Title" Page="1&amp;2"><Text>Imported &amp; Title<\/Text>/);
  assert.match(xml, /<Paragraph Type="Scene Heading" Number="12A" Id="scene&amp;1">/);
  assert.match(xml, /Type="Montage &amp; Beat" Custom="A &quot;quote&quot; &amp; more"/);
  assert.match(xml, /<Text Style="Bold\+Italic" RevisionID="2&amp;3">Bold &lt;<\/Text>/);
  assert.match(xml, /<Text Style="Underline\+Strikeout"> &amp; underlined<\/Text>/);
  assert.match(xml, /<Paragraph Type="Action"><Text><\/Text><\/Paragraph>/);
  assert.doesNotMatch(xml, /SCS-only/);
});

test("FDX export writes outline beats, layout, and flow lines outside screenplay content", () => {
  const outlined = parseFountain("INT. ROOM - NIGHT\n\nThe screenplay stays clean.\n");
  outlined.workspace = {
    ...emptyWorkspace(),
    storyStructure: {
      acts: [{ id: "act-1", title: "Act I" }],
      sequences: [],
      sceneOrder: [outlined.blocks[0].id],
      beats: [
        { id: "beat-a", title: "First & beat", text: "Body <one>\nBody two", color: "#AABBCC", board: { left: 60, top: 80, width: 240, height: 180 }, status: "drafted", moments: [], source: "fdx" },
        { id: "beat-b", title: "Second beat", text: "", color: "#DDDDEEEEFFFF", board: { left: 420, top: 300, width: 220, height: 160 }, status: "idea", moments: [], source: "scs" },
      ],
      connections: [{ id: "link-a-b", fromId: "beat-a", toId: "beat-b", color: "#112233", frontCap: "None", endCap: "Arrow", board: { left: 280, top: 180, width: 160, height: 80 } }],
      board: { id: "board-1", width: 2000, height: 1000, zoomLevel: 110.5, scrollOrigin: "20,40" },
    },
  };

  const { xml, warnings } = toFdxWithWarnings(outlined);
  assert.deepEqual(warnings, []);
  assert.match(xml, /<FinalDraft DocumentType="Script" Template="No" Version="3">/);
  const screenplayContent = xml.match(/<Content>([\s\S]*?)<\/Content>/)?.[1] ?? "";
  assert.doesNotMatch(screenplayContent, /First &amp; beat|Body &lt;one&gt;/);
  assert.match(xml, /<ListItem Color="#AAAABBBBCCCC" Id="beat-a" Title="First &amp; beat" Type="Beat">/);
  assert.match(xml, /<Paragraph><Text>Body &lt;one&gt;<\/Text><\/Paragraph>/);
  assert.match(xml, /<ListItem Color="#111122223333" EndPoint="beat-b" Id="link-a-b" StartPoint="beat-a" Type="PeerLink" EndCap="Arrow" FrontCap="None"\/>/);
  assert.match(xml, /<DisplayBoard Height="1000" Id="board-1" ScrollOrigin="20,40" Type="Beat" Width="2000" ZoomLevel="110.5">/);
  assert.match(xml, /<Item Height="180" Id="beat-a" Left="60" Top="80" Width="240"\/>/);
  assert.match(xml, /<Item Height="80" Id="link-a-b" Left="280" Top="180" Width="160"\/>/);
});

test("FDX export warns and stays valid when stale styles or unsafe metadata cannot be preserved", () => {
  const edited: ScreenplayDocument = {
    titlePage: { title: "", author: "", blocks: [] },
    blocks: [{
      id: "edited-1",
      type: "action",
      text: "Changed\u0001",
      originalType: "Scene Heading",
      metadata: { Type: "Scene Heading", "bad name": "omit" },
      textRuns: [{ text: "Original", bold: true, italic: false, underline: false, strikeout: false, metadata: { Style: "Bold" } }],
    }],
    sceneNotes: {},
  };

  const { xml, warnings } = toFdxWithWarnings(edited);
  assert.match(xml, /<Paragraph Type="Action"><Text>Changed\uFFFD<\/Text><\/Paragraph>/u);
  assert.doesNotMatch(xml, /bad name|Style="Bold"/);
  assert.ok(warnings.some((warning) => warning.includes("styled text no longer matches")));
  assert.ok(warnings.some((warning) => warning.includes("bad name")));
  assert.ok(warnings.some((warning) => warning.includes("invalid XML characters")));
});

test("scene-card moves keep each scene's blocks together", () => {
  const moved = moveScene(document.blocks, 1, 0);
  assert.match(moved[0].text, /EXT\. ROAD/);
  assert.equal(moved[1].text, "The car crashes.");
  assert.match(moved[2].text, /INT\. GARAGE/);
});
