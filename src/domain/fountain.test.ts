import assert from "node:assert/strict";
import test from "node:test";
import { parseFountain, toFountain, toFountainWithWarnings } from "./fountain.ts";
import { canonicalTitlePageField } from "./screenplay.ts";

test("Fountain title pages parse and serialize all supported canonical fields", () => {
  const source = `Title: THE CLOCKWORK HORIZON
Credit: an original screenplay
Authors: Ada Example & Ben Sample
Source: Inspired by synthetic events
Draft date: August 17, 2026
Contact: Example Pictures
   writer@example.test
Copyright: Copyright 2026 Example Pictures
Notes: Synthetic fixture only

INT. CLOCK SHOP - NIGHT

Every clock stops.
`;
  const document = parseFountain(source);

  assert.equal(document.titlePage.title, "THE CLOCKWORK HORIZON");
  assert.equal(document.titlePage.credit, "an original screenplay");
  assert.equal(document.titlePage.author, "Ada Example & Ben Sample");
  assert.equal(document.titlePage.source, "Inspired by synthetic events");
  assert.equal(document.titlePage.draftDate, "August 17, 2026");
  assert.equal(document.titlePage.contact, "Example Pictures\nwriter@example.test");
  assert.equal(document.titlePage.copyright, "Copyright 2026 Example Pictures");
  assert.equal(document.titlePage.notes, "Synthetic fixture only");
  assert.deepEqual(document.titlePage.blocks?.map((block) => block.type), [
    "Title", "Credit", "Authors", "Source", "Draft date", "Contact", "Copyright", "Notes",
  ]);

  const serialized = toFountain(document);
  assert.match(serialized, /^Title: THE CLOCKWORK HORIZON/m);
  assert.match(serialized, /^Author: Ada Example & Ben Sample/m);
  assert.match(serialized, /^Contact: Example Pictures\n   writer@example\.test/m);
  assert.match(serialized, /^Copyright: Copyright 2026 Example Pictures/m);
  const reparsed = parseFountain(serialized);
  assert.deepEqual(
    {
      title: reparsed.titlePage.title,
      credit: reparsed.titlePage.credit,
      author: reparsed.titlePage.author,
      source: reparsed.titlePage.source,
      draftDate: reparsed.titlePage.draftDate,
      contact: reparsed.titlePage.contact,
      copyright: reparsed.titlePage.copyright,
      notes: reparsed.titlePage.notes,
    },
    {
      title: document.titlePage.title,
      credit: document.titlePage.credit,
      author: document.titlePage.author,
      source: document.titlePage.source,
      draftDate: document.titlePage.draftDate,
      contact: document.titlePage.contact,
      copyright: document.titlePage.copyright,
      notes: document.titlePage.notes,
    },
  );
});

test("title-page label classification accepts defensible aliases and rejects vendor fields", () => {
  assert.equal(canonicalTitlePageField("Authors"), "author");
  assert.equal(canonicalTitlePageField("Written By"), "author");
  assert.equal(canonicalTitlePageField("Contact Information"), "contact");
  assert.equal(canonicalTitlePageField("Vendor Layout Slot"), undefined);

  const document = parseFountain("Vendor Layout Slot: preserve in FDX only\n\nINT. ROOM - DAY\n");
  assert.equal(document.titlePage.blocks, undefined);
  assert.equal(document.blocks[0].type, "action");
});

test("Fountain conversion reports title-page details it cannot represent", () => {
  const document = parseFountain("Title: Styled Title\nAuthor: Ada Example\n\nINT. ROOM - DAY\n");
  document.titlePage.blocks = [
    { type: "Credit", text: "", metadata: { Type: "Credit" } },
    {
      type: "Title",
      text: "Styled Title",
      textRuns: [{ text: "Styled Title", bold: true, italic: false, underline: false, strikeout: false, metadata: { Style: "Bold" } }],
      metadata: { Type: "Title", Alignment: "Center" },
    },
    { type: "Title", text: "Alternate title", metadata: { Type: "Title" } },
    { type: "Vendor Legal Line", text: "Opaque", metadata: { VendorFlag: "yes" } },
  ];

  const result = toFountainWithWarnings(document);
  assert.equal(result.text, toFountain(document));
  assert.equal(result.warnings.length, 6);
  assert.ok(result.warnings.some((warning) => warning.includes("custom title-page")));
  assert.ok(result.warnings.some((warning) => warning.includes("duplicate imported")));
  assert.ok(result.warnings.some((warning) => warning.includes("field order")));
  assert.ok(result.warnings.some((warning) => warning.includes("empty title-page")));
  assert.ok(result.warnings.some((warning) => warning.includes("positioning or vendor attributes")));
  assert.ok(result.warnings.some((warning) => warning.includes("character-run styling")));
});
