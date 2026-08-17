import assert from "node:assert/strict";
import test from "node:test";
import { parseFountain } from "./fountain.ts";
import {
  emptyWorkspace,
  representativeTitlePageBlockIndexes,
  type ScreenplayDocument,
  updateTitlePageBlockText,
  updateTitlePageField,
} from "./screenplay.ts";
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

test("FDX export preserves rich ordered title-page paragraphs, runs, empty fields, and custom attributes", () => {
  const rich: ScreenplayDocument = {
    titlePage: {
      title: "THE CLOCKWORK HORIZON",
      credit: "an original screenplay",
      author: "Ada Example & Ben Sample",
      source: "Inspired by synthetic events",
      contact: "writer@example.test",
      copyright: "Copyright 2026 Example Pictures",
      notes: "",
      blocks: [
        {
          type: "Title",
          text: "THE CLOCKWORK HORIZON",
          textRuns: [
            { text: "THE CLOCKWORK ", bold: true, italic: false, underline: false, strikeout: false, metadata: { Style: "Bold" } },
            { text: "HORIZON", bold: false, italic: true, underline: false, strikeout: false, revisionId: "7", metadata: { Style: "Italic", RevisionID: "7" } },
          ],
          metadata: { Type: "Title", Alignment: "Center", FirstIndent: "0.00" },
        },
        { type: "Credit", text: "an original screenplay", metadata: { Type: "Credit", Alignment: "Center" } },
        { type: "Authors", text: "", metadata: { Type: "Authors", VendorEmptyByline: "yes" } },
        {
          type: "Authors",
          text: "Ada Example & Ben Sample",
          textRuns: [
            { text: "Ada Example", bold: false, italic: false, underline: false, strikeout: false, metadata: {} },
            { text: " & Ben Sample", bold: false, italic: false, underline: true, strikeout: false, metadata: { Style: "Underline" } },
          ],
          metadata: { Type: "Authors", Alignment: "Center" },
        },
        { type: "Author", text: "Duplicate author paragraph", metadata: { Type: "Author", Alignment: "Center" } },
        { type: "Contact", text: "writer@example.test", metadata: { Type: "Contact", VendorContactLayout: "stacked" } },
        { type: "Notes", text: "", metadata: { Type: "Notes", Alignment: "Left" } },
        { type: "Custom Dedication", text: "For edge cases.", metadata: { Type: "Custom Dedication", VendorFlag: "preserve-me" } },
        { type: "", text: "Untyped vendor content", metadata: { VendorNoType: "yes" } },
        { type: "Empty Optional", text: "", metadata: { Type: "Empty Optional", VendorEmpty: "yes" } },
      ],
    },
    blocks: [{ id: "action-1", type: "action", text: "Every clock stops." }],
    sceneNotes: {},
  };

  const { xml, warnings } = toFdxWithWarnings(rich);
  assert.deepEqual(warnings, []);
  assert.match(xml, /<Paragraph Type="Title" Alignment="Center" FirstIndent="0\.00"><Text Style="Bold">THE CLOCKWORK <\/Text><Text Style="Italic" RevisionID="7">HORIZON<\/Text><\/Paragraph>/);
  assert.match(xml, /<Paragraph Type="Authors" VendorEmptyByline="yes"><Text><\/Text><\/Paragraph>/);
  assert.match(xml, /<Paragraph Type="Authors" Alignment="Center"><Text>Ada Example<\/Text><Text Style="Underline"> &amp; Ben Sample<\/Text><\/Paragraph>/);
  assert.match(xml, /<Paragraph Type="Notes" Alignment="Left"><Text><\/Text><\/Paragraph>/);
  assert.match(xml, /Type="Custom Dedication" VendorFlag="preserve-me"/);
  assert.match(xml, /<Paragraph VendorNoType="yes"><Text>Untyped vendor content<\/Text><\/Paragraph>/);
  assert.match(xml, /Type="Empty Optional" VendorEmpty="yes"><Text><\/Text>/);
  assert.match(xml, /<Paragraph Type="Source"><Text>Inspired by synthetic events<\/Text><\/Paragraph>/);
  assert.match(xml, /<Paragraph Type="Copyright"><Text>Copyright 2026 Example Pictures<\/Text><\/Paragraph>/);
  assert.ok(xml.indexOf('Type="Authors"') < xml.indexOf('Type="Author"'));
  assert.ok(xml.indexOf('Type="Author"') < xml.indexOf('Type="Custom Dedication"'));

  const edited = structuredClone(rich);
  edited.titlePage.title = "THE EDITED HORIZON";
  const fallback = toFdxWithWarnings(edited);
  assert.ok(fallback.warnings.some((warning) => warning.includes("edited title-page text")));
  assert.match(fallback.xml, /<Paragraph Type="Title" Alignment="Center" FirstIndent="0\.00"><Text>THE EDITED HORIZON<\/Text><\/Paragraph>/);
});

test("advanced title-page edits synchronize the representative canonical row and retain rich runs", () => {
  const titlePage: ScreenplayDocument["titlePage"] = {
    title: "Styled Title",
    author: "Ada & Ben Sample",
    blocks: [
      { type: "Authors", text: "", metadata: { VendorEmptyByline: "yes" } },
      {
        type: "Authors",
        text: "Ada & Ben Sample",
        textRuns: [
          { text: "Ada", bold: true, italic: false, underline: false, strikeout: false, metadata: { Style: "Bold" } },
          { text: " & Ben Sample", bold: false, italic: true, underline: false, strikeout: false, metadata: { Style: "Italic", VendorRun: "keep" } },
        ],
        metadata: { Alignment: "Center", VendorSlot: "byline" },
      },
      { type: "Author", text: "Duplicate credit", metadata: { VendorDuplicate: "keep" } },
    ],
  };

  assert.equal(representativeTitlePageBlockIndexes(titlePage).get("author"), 1);
  const edited = updateTitlePageBlockText(titlePage, 1, "Ada & Bea Sample");
  assert.equal(edited.author, "Ada & Bea Sample");
  assert.deepEqual(edited.blocks?.[0], titlePage.blocks?.[0]);
  assert.deepEqual(edited.blocks?.[1].textRuns, [
    { text: "Ada", bold: true, italic: false, underline: false, strikeout: false, metadata: { Style: "Bold" } },
    { text: " & Bea Sample", bold: false, italic: true, underline: false, strikeout: false, metadata: { Style: "Italic", VendorRun: "keep" } },
  ]);
  assert.deepEqual(edited.blocks?.[1].metadata, { Alignment: "Center", VendorSlot: "byline" });
  assert.deepEqual(edited.blocks?.[2], titlePage.blocks?.[2]);

  const exported = toFdxWithWarnings({
    titlePage: edited,
    blocks: [{ id: "action-1", type: "action", text: "Action." }],
    sceneNotes: {},
  });
  assert.deepEqual(exported.warnings, []);
  assert.match(exported.xml, /<Text Style="Bold">Ada<\/Text><Text Style="Italic" VendorRun="keep"> &amp; Bea Sample<\/Text>/);
  assert.match(exported.xml, /<Paragraph Type="Author" VendorDuplicate="keep"><Text>Duplicate credit<\/Text>/);
});

test("canonical title fields update their representative rich row without rewriting duplicates", () => {
  const titlePage: ScreenplayDocument["titlePage"] = {
    title: "Old Title",
    author: "Writer",
    blocks: [
      {
        type: "Title",
        text: "Old Title",
        textRuns: [{ text: "Old Title", bold: true, italic: false, underline: false, strikeout: false, metadata: { Style: "Bold" } }],
        metadata: { Alignment: "Center" },
      },
      { type: "Title", text: "Alternate Title", metadata: { VendorAlternate: "yes" } },
    ],
  };

  const edited = updateTitlePageField(titlePage, "title", "New Title");
  assert.equal(edited.title, "New Title");
  assert.equal(edited.blocks?.[0].text, "New Title");
  assert.equal(edited.blocks?.[0].textRuns?.[0].text, "New Title");
  assert.deepEqual(edited.blocks?.[1], titlePage.blocks?.[1]);

  const duplicateEdit = updateTitlePageBlockText(edited, 1, "Alternate Revised");
  assert.equal(duplicateEdit.title, "New Title");
  assert.equal(duplicateEdit.blocks?.[1].text, "Alternate Revised");
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
