import assert from "node:assert/strict";
import test from "node:test";
import { jsPDF } from "jspdf";
import {
  decodeTreatmentFile,
  encodeTreatmentFile,
  inferTreatmentTitle,
  normalizeTreatmentMarkdown,
} from "./treatmentService.ts";

const treatment = {
  title: "Signal Fire",
  markdown: `# Signal Fire

## Act One

Mara finds a **sealed letter** and follows an [old map](https://example.com/map).

- Find the transmitter
- Cross the frozen lake

1. Make the call
2. Face the answer

> Nothing stays buried forever.
`,
};

test("normalizes Markdown treatment text and infers stable titles", () => {
  assert.equal(normalizeTreatmentMarkdown("\uFEFF# Pilot\r\n\r\nStory.\r\n"), "# Pilot\n\nStory.\n");
  assert.equal(inferTreatmentTitle("# The Long Road\n", "fallback.md"), "The Long Road");
  assert.equal(inferTreatmentTitle("No heading.\n", "second-draft.docx"), "second draft");
});

test("Markdown treatment transfer is UTF-8 and lossless after newline normalization", async () => {
  const encoded = await encodeTreatmentFile(treatment, "md");
  const decoded = await decodeTreatmentFile(encoded.contents, "md", "signal-fire.md");
  assert.equal(decoded.title, treatment.title);
  assert.equal(decoded.markdown, normalizeTreatmentMarkdown(treatment.markdown));
  assert.deepEqual(decoded.warnings, []);

  await assert.rejects(() => decodeTreatmentFile(Uint8Array.from([0xff, 0xfe]), "md", "bad.md"), /UTF-8/);
});

test("Word treatment transfer preserves prose structure, emphasis, lists, and links", async () => {
  const encoded = await encodeTreatmentFile(treatment, "docx");
  assert.deepEqual(Array.from(encoded.contents.slice(0, 4)), [0x50, 0x4b, 0x03, 0x04]);

  const decoded = await decodeTreatmentFile(encoded.contents, "docx", "signal-fire.docx");
  assert.equal(decoded.title, treatment.title);
  assert.match(decoded.markdown, /^# Signal Fire/m);
  assert.match(decoded.markdown, /^## Act One/m);
  assert.match(decoded.markdown, /\*\*sealed letter\*\*/);
  assert.match(decoded.markdown, /\[old map\]\(https:\/\/example\.com\/map\)/);
  assert.match(decoded.markdown, /^[-*]\s+Find the transmitter/m);
  assert.match(decoded.markdown, /^1\.\s+Make the call/m);
  assert.match(decoded.markdown, /Nothing stays buried forever\./m);
});

test("PDF treatment transfer creates a real PDF and recovers selectable prose", async () => {
  const encoded = await encodeTreatmentFile(treatment, "pdf");
  assert.equal(new TextDecoder().decode(encoded.contents.slice(0, 5)), "%PDF-");
  assert.match(new TextDecoder().decode(encoded.contents.slice(-64)), /%%EOF/);

  const decoded = await decodeTreatmentFile(encoded.contents, "pdf", "signal-fire.pdf");
  assert.match(decoded.markdown, /Signal Fire/i);
  assert.match(decoded.markdown, /Mara finds a sealed letter/i);
  assert.match(decoded.markdown, /Find the transmitter/i);
  assert.match(decoded.markdown, /Nothing stays buried forever/i);
  assert.doesNotMatch(decoded.markdown, /%Nothing stays buried forever/i);
  assert.ok(decoded.warnings.some((warning) => warning.code === "formatting-simplified"));
});

test("PDF import explains that image-only documents need OCR", async () => {
  const pdf = new jsPDF({ unit: "pt", format: "letter" });
  const bytes = new Uint8Array(pdf.output("arraybuffer"));
  await assert.rejects(() => decodeTreatmentFile(bytes, "pdf", "scan.pdf"), /selectable text.*OCR/i);
});

test("unsafe and unsupported Markdown content produces conversion notes", async () => {
  const encoded = await encodeTreatmentFile({
    title: "Notes",
    markdown: "# Notes\n\n[Unsafe](javascript:alert(1))\n\n![Board](board.png)\n\n<table><tr><td>Raw</td></tr></table>\n",
  }, "docx");
  assert.ok(encoded.warnings.some((warning) => warning.code === "unsafe-link"));
  assert.ok(encoded.warnings.some((warning) => warning.code === "unsupported-content"));
});
