import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import type { ParagraphChild } from "docx";
import { marked, type Token, type Tokens } from "marked";

export type TreatmentFileFormat = "md" | "docx" | "pdf";

export interface TreatmentTransferWarning {
  code: "unsupported-content" | "formatting-simplified" | "unsafe-link" | "font-limits" | "converter-warning";
  message: string;
}

export interface ImportedTreatmentFile {
  path: string;
  fileName: string;
  format: TreatmentFileFormat;
  title: string;
  markdown: string;
  warnings: TreatmentTransferWarning[];
}

export interface TreatmentExportResult {
  path: string;
  format: TreatmentFileFormat;
  warnings: TreatmentTransferWarning[];
}

export interface EncodedTreatmentFile {
  contents: Uint8Array;
  warnings: TreatmentTransferWarning[];
}

interface NativeTreatmentFilePayload {
  path: string;
  fileName: string;
  format: TreatmentFileFormat;
  contents: number[];
}

interface TreatmentSource {
  title: string;
  markdown: string;
}

interface InlineRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
  code?: boolean;
  href?: string;
}

interface RenderBlock {
  kind: "title" | "heading" | "paragraph" | "list" | "quote" | "code" | "rule";
  runs: InlineRun[];
  level?: number;
  ordered?: boolean;
  depth?: number;
  ordinal?: number;
}

const formatExtensions: Record<TreatmentFileFormat, string> = { md: "md", docx: "docx", pdf: "pdf" };
const MAX_PDF_PAGES = 500;

export async function chooseAndImportTreatment(): Promise<ImportedTreatmentFile | null> {
  const selected = await open({
    multiple: false,
    title: "Import treatment",
    filters: [{ name: "Treatment documents", extensions: ["md", "markdown", "docx", "pdf"] }],
  });
  if (typeof selected !== "string") return null;

  const payload = await invoke<NativeTreatmentFilePayload>("read_treatment_file", { path: selected });
  const decoded = await decodeTreatmentFile(Uint8Array.from(payload.contents), payload.format, payload.fileName);
  return { ...decoded, path: payload.path, fileName: payload.fileName, format: payload.format };
}

export async function saveTreatmentExport(source: TreatmentSource, format: TreatmentFileFormat): Promise<TreatmentExportResult | null> {
  const encoded = await encodeTreatmentFile(source, format);
  const extension = formatExtensions[format];
  let path = await save({
    title: `Export treatment as ${format === "md" ? "Markdown" : format === "docx" ? "Word" : "PDF"}`,
    defaultPath: `${safeFileStem(source.title)}.${extension}`,
    filters: [{ name: format === "md" ? "Markdown" : format === "docx" ? "Word document" : "PDF document", extensions: format === "md" ? ["md", "markdown"] : [extension] }],
  });
  if (!path) return null;
  if (!hasFormatExtension(path, format)) path += `.${extension}`;

  const written = await invoke<string>("write_treatment_file", {
    path,
    format,
    contents: Array.from(encoded.contents),
  });
  return { path: written, format, warnings: encoded.warnings };
}

export async function decodeTreatmentFile(
  contents: Uint8Array,
  format: TreatmentFileFormat,
  fileName = `treatment.${formatExtensions[format]}`,
): Promise<Omit<ImportedTreatmentFile, "path" | "fileName" | "format">> {
  if (!contents.length) throw new Error("The treatment file is empty.");
  if (format === "md") {
    let markdown: string;
    try {
      markdown = new TextDecoder("utf-8", { fatal: true }).decode(contents);
    } catch {
      throw new Error("Markdown treatments must use UTF-8 text.");
    }
    markdown = normalizeTreatmentMarkdown(markdown);
    return { title: inferTreatmentTitle(markdown, fileName), markdown, warnings: [] };
  }
  if (format === "docx") return decodeDocx(contents, fileName);
  return decodePdf(contents, fileName);
}

export async function encodeTreatmentFile(source: TreatmentSource, format: TreatmentFileFormat): Promise<EncodedTreatmentFile> {
  const markdown = normalizeTreatmentMarkdown(source.markdown || `# ${source.title || "Untitled Treatment"}\n`);
  if (format === "md") return { contents: new TextEncoder().encode(markdown), warnings: [] };
  const warnings: TreatmentTransferWarning[] = [];
  const blocks = markdownBlocks(markdown, warnings);
  return format === "docx" ? encodeDocx({ ...source, markdown }, blocks, warnings) : encodePdf({ ...source, markdown }, blocks, warnings);
}

export function normalizeTreatmentMarkdown(markdown: string): string {
  const normalized = markdown.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").replace(/\0/g, "").trimEnd();
  return `${normalized || "# Untitled Treatment"}\n`;
}

export function inferTreatmentTitle(markdown: string, fileName: string): string {
  const heading = /^\s*#\s+(.+?)\s*#*\s*$/m.exec(markdown)?.[1]?.trim();
  if (heading) return heading;
  const stem = fileName.replace(/\.(?:markdown|md|docx|pdf)$/i, "").replace(/[-_]+/g, " ").trim();
  return stem || "Imported Treatment";
}

async function decodeDocx(contents: Uint8Array, fileName: string) {
  const mammothModule = await import("mammoth");
  const NodeBuffer = (globalThis as typeof globalThis & { Buffer?: { from(value: Uint8Array): unknown } }).Buffer;
  const input = NodeBuffer ? { buffer: NodeBuffer.from(contents) } : { arrayBuffer: contents.slice().buffer };
  const result = await mammothModule.convertToHtml(input as Parameters<typeof mammothModule.convertToHtml>[0], {
    styleMap: [
      "p[style-name='Title'] => h1:fresh",
      "p[style-name='Subtitle'] => h2:fresh",
      "p[style-name='Heading 1'] => h1:fresh",
      "p[style-name='Heading 2'] => h2:fresh",
      "p[style-name='Heading 3'] => h3:fresh",
      "p[style-name='Heading 4'] => h4:fresh",
      "p[style-name='Heading 5'] => h5:fresh",
      "p[style-name='Heading 6'] => h6:fresh",
    ],
    includeDefaultStyleMap: true,
  });
  const warnings: TreatmentTransferWarning[] = result.messages.map((message) => ({
    code: "converter-warning",
    message: `Word import: ${message.message}`,
  }));
  if (/<(?:table|img)\b/i.test(result.value)) addWarning(warnings, "unsupported-content", "Word tables and images are simplified during treatment import.");

  const turndownModule = await import("turndown");
  const TurndownService = turndownModule.default;
  const turndown = new TurndownService({
    headingStyle: "atx",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    emDelimiter: "*",
    strongDelimiter: "**",
  });
  turndown.addRule("safe-treatment-links", {
    filter: (node) => node.nodeName === "A" && Boolean((node as HTMLAnchorElement).getAttribute("href")),
    replacement: (content, node) => {
      const href = (node as HTMLAnchorElement).getAttribute("href") ?? "";
      if (!safeLink(href)) {
        addWarning(warnings, "unsafe-link", "An unsafe link was converted to plain text during Word import.");
        return content;
      }
      return `[${content}](${href.replace(/\)/g, "\\)")})`;
    },
  });
  turndown.addRule("treatment-images", {
    filter: "img",
    replacement: (_content, node) => {
      addWarning(warnings, "unsupported-content", "Images are represented by alt text in imported treatments.");
      const alt = (node as HTMLImageElement).getAttribute("alt")?.trim();
      return alt ? `[Image: ${alt}]` : "[Image]";
    },
  });
  const markdown = normalizeTreatmentMarkdown(turndown.turndown(result.value));
  return { title: inferTreatmentTitle(markdown, fileName), markdown, warnings };
}

async function decodePdf(contents: Uint8Array, fileName: string) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  if (typeof window !== "undefined" && !pdfjs.GlobalWorkerOptions.workerSrc) {
    const worker = await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url");
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  }
  const task = pdfjs.getDocument({ data: contents.slice(), useSystemFonts: true });
  const document = await task.promise;
  try {
    if (document.numPages > MAX_PDF_PAGES) throw new Error(`PDF treatments cannot exceed ${MAX_PDF_PAGES} pages.`);
    const pages: PdfLine[][] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const text = await page.getTextContent();
      const items = text.items.flatMap((item): PdfTextItem[] => {
        if (!("str" in item) || !item.str.trim()) return [];
        return [{
          text: item.str,
          x: item.transform[4],
          y: item.transform[5],
          width: item.width,
          size: Math.max(item.height || 0, Math.hypot(item.transform[2], item.transform[3]), 1),
          bold: /bold|black|heavy/i.test(item.fontName),
          hasEol: item.hasEOL,
        }];
      });
      pages.push(pdfLines(items));
    }
    const markdown = pdfLinesToMarkdown(pages);
    if (!markdown.trim()) throw new Error("This PDF contains no selectable text. Scanned PDFs need OCR before they can be imported.");
    const normalized = normalizeTreatmentMarkdown(markdown);
    return {
      title: inferTreatmentTitle(normalized, fileName),
      markdown: normalized,
      warnings: [{ code: "formatting-simplified" as const, message: "PDF import preserves selectable text, but layout, images, and some formatting are simplified." }],
    };
  } finally {
    await task.destroy();
  }
}

async function encodeDocx(source: TreatmentSource, blocks: RenderBlock[], warnings: TreatmentTransferWarning[]): Promise<EncodedTreatmentFile> {
  const {
    AlignmentType,
    Document,
    ExternalHyperlink,
    HeadingLevel,
    LevelFormat,
    Packer,
    Paragraph,
    TextRun,
    convertInchesToTwip,
  } = await import("docx");
  const headings = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6];
  const children = blocks.map((block) => {
    const runs: ParagraphChild[] = [];
    block.runs.forEach((run) => {
      const options = { text: run.text, bold: run.bold, italics: run.italic, strike: run.strike, font: run.code ? "Courier New" : "Georgia" };
      if (run.href && safeLink(run.href)) runs.push(new ExternalHyperlink({ children: [new TextRun({ ...options, color: "0563C1", underline: {} })], link: run.href }));
      else runs.push(new TextRun(options));
    });
    if (block.kind === "rule") return new Paragraph({ text: "* * *", spacing: { before: 120, after: 120 } });
    if (block.kind === "title") return new Paragraph({ children: runs, heading: HeadingLevel.TITLE, spacing: { after: 240 } });
    if (block.kind === "heading") return new Paragraph({ children: runs, heading: headings[Math.min(5, Math.max(0, (block.level ?? 1) - 1))], spacing: { before: 240, after: 100 } });
    if (block.kind === "list") return new Paragraph({
      children: runs,
      ...(block.ordered ? { numbering: { reference: "treatment-numbering", level: Math.min(5, block.depth ?? 0) } } : { bullet: { level: Math.min(5, block.depth ?? 0) } }),
      spacing: { after: 60 },
    });
    return new Paragraph({
      children: runs,
      indent: block.kind === "quote" ? { left: convertInchesToTwip(0.35) } : undefined,
      spacing: { after: block.kind === "code" ? 100 : 160, line: 300 },
      shading: block.kind === "code" ? { fill: "F3F3F3" } : undefined,
    });
  });
  const document = new Document({
    title: source.title,
    creator: "Script Control Software",
    description: "Treatment exported by Script Control Software",
    numbering: {
      config: [{
        reference: "treatment-numbering",
        levels: Array.from({ length: 6 }, (_, level) => ({
          level,
          format: LevelFormat.DECIMAL,
          text: `%${level + 1}.`,
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: convertInchesToTwip(0.25 + level * 0.25), hanging: convertInchesToTwip(0.2) } } },
        })),
      }],
    },
    sections: [{ properties: { page: { margin: { top: convertInchesToTwip(0.8), bottom: convertInchesToTwip(0.8), left: convertInchesToTwip(0.85), right: convertInchesToTwip(0.85) } } }, children }],
  });
  return { contents: new Uint8Array(await Packer.toArrayBuffer(document)), warnings };
}

async function encodePdf(source: TreatmentSource, blocks: RenderBlock[], warnings: TreatmentTransferWarning[]): Promise<EncodedTreatmentFile> {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "pt", format: "letter", compress: true, putOnlyUsedFonts: true });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 54;
  let y = margin;

  const nextLine = (lineHeight: number) => {
    y += lineHeight;
    if (y <= pageHeight - margin) return;
    pdf.addPage();
    y = margin;
  };
  const render = (block: RenderBlock) => {
    if (block.kind === "rule") {
      if (y + 16 > pageHeight - margin) { pdf.addPage(); y = margin; }
      pdf.setDrawColor(150);
      pdf.line(margin, y + 5, pageWidth - margin, y + 5);
      y += 20;
      return;
    }
    const fontSize = block.kind === "title" ? 22 : block.kind === "heading" ? Math.max(13, 20 - (block.level ?? 1) * 1.5) : 11.5;
    const lineHeight = fontSize * 1.35;
    const left = margin + (block.kind === "quote" ? 22 : 0) + (block.kind === "list" ? Math.min(5, block.depth ?? 0) * 15 : 0);
    const right = margin;
    if (y + lineHeight > pageHeight - margin) { pdf.addPage(); y = margin; }
    let x = left;
    const runs = block.kind === "list"
      ? [{ text: block.ordered ? `${block.ordinal ?? 1}. ` : "• ", bold: true } as InlineRun, ...block.runs]
      : block.kind === "quote" ? [{ text: "| ", bold: true } as InlineRun, ...block.runs] : block.runs;
    for (const run of runs) {
      const font = run.code ? "courier" : "times";
      const style = run.bold && run.italic ? "bolditalic" : run.bold ? "bold" : run.italic ? "italic" : "normal";
      pdf.setFont(font, style);
      pdf.setFontSize(fontSize);
      for (const part of run.text.split(/(\s+|\n)/)) {
        if (!part) continue;
        if (part.includes("\n")) { x = left; nextLine(lineHeight); continue; }
        const width = pdf.getTextWidth(part);
        if (!/^\s+$/.test(part) && x + width > pageWidth - right && x > left) { x = left; nextLine(lineHeight); }
        if (/^\s+$/.test(part) && x === left) continue;
        const safeText = pdfText(part, warnings);
        if (run.href && safeLink(run.href) && !/^\s+$/.test(part)) pdf.textWithLink(safeText, x, y, { url: run.href });
        else pdf.text(safeText, x, y);
        if (run.strike && !/^\s+$/.test(part)) pdf.line(x, y - fontSize * 0.3, x + width, y - fontSize * 0.3);
        x += width;
      }
    }
    y += block.kind === "heading" || block.kind === "title" ? lineHeight * 1.25 : lineHeight * 1.55;
  };
  blocks.forEach(render);

  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    pdf.setPage(page);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(110);
    pdf.text(`${source.title || "Treatment"}  |  ${page}`, pageWidth - margin, pageHeight - 24, { align: "right" });
  }
  return { contents: new Uint8Array(pdf.output("arraybuffer")), warnings };
}

function markdownBlocks(markdown: string, warnings: TreatmentTransferWarning[]): RenderBlock[] {
  const tokens = marked.lexer(markdown, { gfm: true });
  const blocks: RenderBlock[] = [];
  const visit = (items: Token[], context: { quote?: boolean; depth?: number } = {}) => {
    for (const token of items) {
      if (token.type === "space" || token.type === "def") continue;
      if (token.type === "heading") {
        const heading = token as Tokens.Heading;
        blocks.push({ kind: heading.depth === 1 ? "title" : "heading", level: heading.depth, runs: inlineRuns(heading.tokens, warnings) });
      } else if (token.type === "paragraph" || token.type === "text") {
        const inline = "tokens" in token && token.tokens ? token.tokens : [{ type: "text", raw: token.raw, text: "text" in token ? token.text : token.raw } as Tokens.Text];
        blocks.push({ kind: context.quote ? "quote" : "paragraph", runs: inlineRuns(inline, warnings) });
      } else if (token.type === "list") {
        const list = token as Tokens.List;
        list.items.forEach((item: Tokens.ListItem, index: number) => {
          const first = item.tokens.find((child) => child.type === "text" || child.type === "paragraph");
          const inline = first && "tokens" in first && first.tokens ? first.tokens : marked.Lexer.lexInline(item.text);
          blocks.push({ kind: "list", runs: inlineRuns(inline, warnings), ordered: list.ordered, depth: context.depth ?? 0, ordinal: typeof list.start === "number" ? list.start + index : index + 1 });
          const nested = item.tokens.filter((child) => child.type === "list");
          visit(nested, { ...context, depth: (context.depth ?? 0) + 1 });
        });
      } else if (token.type === "blockquote") {
        visit((token as Tokens.Blockquote).tokens, { ...context, quote: true });
      } else if (token.type === "code") {
        blocks.push({ kind: "code", runs: [{ text: (token as Tokens.Code).text, code: true }] });
      } else if (token.type === "hr") {
        blocks.push({ kind: "rule", runs: [] });
      } else if (token.type === "table") {
        const table = token as Tokens.Table;
        addWarning(warnings, "unsupported-content", "Markdown tables are flattened to paragraphs in document exports.");
        const rows = [table.header, ...table.rows];
        rows.forEach((row: Tokens.TableCell[]) => blocks.push({ kind: "paragraph", runs: row.flatMap((cell: Tokens.TableCell, index: number) => [...(index ? [{ text: " | " } as InlineRun] : []), ...inlineRuns(cell.tokens, warnings)]) }));
      } else if (token.type === "html") {
        const html = token as Tokens.HTML;
        addWarning(warnings, "unsupported-content", "Raw HTML is converted to plain text in treatment exports.");
        const text = html.text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        if (text) blocks.push({ kind: "paragraph", runs: [{ text }] });
      }
    }
  };
  visit(tokens);
  return blocks.length ? blocks : [{ kind: "title", runs: [{ text: "Untitled Treatment" }] }];
}

function inlineRuns(tokens: Token[], warnings: TreatmentTransferWarning[], inherited: Omit<InlineRun, "text"> = {}): InlineRun[] {
  return tokens.flatMap((token): InlineRun[] => {
    if (token.type === "strong") return inlineRuns((token as Tokens.Strong).tokens, warnings, { ...inherited, bold: true });
    if (token.type === "em") return inlineRuns((token as Tokens.Em).tokens, warnings, { ...inherited, italic: true });
    if (token.type === "del") return inlineRuns((token as Tokens.Del).tokens, warnings, { ...inherited, strike: true });
    if (token.type === "codespan") return [{ text: (token as Tokens.Codespan).text, ...inherited, code: true }];
    if (token.type === "link") {
      const link = token as Tokens.Link;
      if (!safeLink(link.href)) {
        addWarning(warnings, "unsafe-link", "An unsafe Markdown link was exported as plain text.");
        return inlineRuns(link.tokens, warnings, inherited);
      }
      return inlineRuns(link.tokens, warnings, { ...inherited, href: link.href });
    }
    if (token.type === "image") {
      const image = token as Tokens.Image;
      addWarning(warnings, "unsupported-content", "Markdown images are represented by alt text in treatment exports.");
      return [{ text: image.text ? `[Image: ${image.text}]` : "[Image]", ...inherited }];
    }
    if (token.type === "br") return [{ text: "\n", ...inherited }];
    if (token.type === "html") {
      const html = token as Tokens.HTML;
      addWarning(warnings, "unsupported-content", "Inline HTML is converted to plain text in treatment exports.");
      return [{ text: html.text.replace(/<[^>]+>/g, ""), ...inherited }];
    }
    if ("tokens" in token && token.tokens?.length) return inlineRuns(token.tokens, warnings, inherited);
    if ("text" in token && typeof token.text === "string") return [{ text: token.text, ...inherited }];
    return [];
  });
}

interface PdfTextItem { text: string; x: number; y: number; width: number; size: number; bold: boolean; hasEol: boolean }
interface PdfLine { text: string; y: number; size: number; bold: boolean }

function pdfLines(items: PdfTextItem[]): PdfLine[] {
  const lines: PdfTextItem[][] = [];
  for (const item of [...items].sort((left, right) => right.y - left.y || left.x - right.x)) {
    const line = lines.find((candidate) => Math.abs(candidate[0].y - item.y) <= Math.max(2, item.size * 0.2));
    if (line) line.push(item); else lines.push([item]);
  }
  return lines.map((line) => {
    line.sort((left, right) => left.x - right.x);
    let text = "";
    let previousRight = 0;
    for (const item of line) {
      const average = item.width / Math.max(1, item.text.length);
      if (text && item.x - previousRight > average * 0.35 && !text.endsWith(" ")) text += " ";
      text += item.text;
      previousRight = item.x + item.width;
    }
    return { text: text.trim(), y: line[0].y, size: Math.max(...line.map((item) => item.size)), bold: line.some((item) => item.bold) };
  }).filter((line) => line.text);
}

function pdfLinesToMarkdown(pages: PdfLine[][]): string {
  const all = pages.flat();
  const sizes = all.map((line) => line.size).sort((a, b) => a - b);
  const bodySize = sizes[Math.floor(sizes.length / 2)] || 10;
  const repeatedEdges = new Map<string, number>();
  pages.forEach((lines) => [lines[0], lines[lines.length - 1]].forEach((line) => {
    if (!line) return;
    const key = line.text.toLowerCase().replace(/\d+/g, "#").trim();
    repeatedEdges.set(key, (repeatedEdges.get(key) ?? 0) + 1);
  }));
  const output: string[] = [];
  pages.forEach((lines) => {
    let previous: PdfLine | undefined;
    lines.forEach((line, index) => {
      const edgeKey = line.text.toLowerCase().replace(/\d+/g, "#").trim();
      if ((index === 0 || index === lines.length - 1) && (repeatedEdges.get(edgeKey) ?? 0) >= 3) return;
      const heading = line.size >= bodySize * 1.45 ? "# " : line.size >= bodySize * 1.2 || (line.bold && line.text.length < 80) ? "## " : "";
      const list = /^(?:[•●▪◦*-]|\d+[.)])\s+/.test(line.text);
      const gap = previous ? previous.y - line.y : bodySize * 2;
      if (heading || list || gap > Math.max(bodySize * 1.65, line.size * 1.5)) output.push("");
      if (heading) output.push(`${heading}${line.text}`);
      else if (list) output.push(line.text.replace(/^[•●▪◦]\s*/, "- "));
      else if (output.length && output[output.length - 1] && !output[output.length - 1].startsWith("#") && !/^(?:-|\d+[.)])\s/.test(output[output.length - 1])) output[output.length - 1] += ` ${line.text}`;
      else output.push(line.text);
      previous = line;
    });
    output.push("");
  });
  return output.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function safeLink(href: string): boolean {
  return /^(?:https?:|mailto:)/i.test(href) || href.startsWith("#");
}

function addWarning(warnings: TreatmentTransferWarning[], code: TreatmentTransferWarning["code"], message: string) {
  if (!warnings.some((warning) => warning.code === code && warning.message === message)) warnings.push({ code, message });
}

function pdfText(value: string, warnings: TreatmentTransferWarning[]): string {
  if (/[^\u0009\u000a\u000d\u0020-\u00ff]/.test(value)) addWarning(warnings, "font-limits", "The PDF exporter uses a standard embedded font; some non-Latin characters may be substituted.");
  return value;
}

function safeFileStem(value: string): string {
  return value.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "treatment";
}

function hasFormatExtension(path: string, format: TreatmentFileFormat): boolean {
  return format === "md" ? /\.(?:md|markdown)$/i.test(path) : new RegExp(`\\.${format}$`, "i").test(path);
}
