import {
  TITLE_PAGE_FIELD_LABELS,
  TITLE_PAGE_FIELD_ORDER,
  type TitlePage,
  type TitlePageBlock,
  type TitlePageField,
  updateTitlePageBlockText,
  updateTitlePageField,
} from "../domain/screenplay.ts";
import "./titlePageEditor.css";

export interface TitlePageEditorProps {
  value: TitlePage;
  onChange: (titlePage: TitlePage) => void;
  readOnly?: boolean;
}

const multilineFields = new Set<TitlePageField>(["source", "contact", "notes"]);

/** Edits canonical title fields while preserving the ordered imported FDX presentation. */
export default function TitlePageEditor({ value, onChange, readOnly = false }: TitlePageEditorProps) {
  const blocks = value.blocks ?? [];
  const customCount = blocks.filter((block) => !canonicalBlockType(block.type)).length;
  const setField = (field: TitlePageField, text: string) => onChange(updateTitlePageField(value, field, text));
  const setBlocks = (next: TitlePageBlock[]) => onChange({ ...value, blocks: next });
  return (
    <section className="title-page-editor" aria-labelledby="title-page-editor-heading">
      <span id="title-page-editor-heading" className="title-card-hint">Title page</span>
      <div className="title-page-fields">
        {TITLE_PAGE_FIELD_ORDER.map((field) => {
          const fieldValue = value[field] ?? "";
          const className = field === "title" ? "title-card-title" : field === "author" ? "title-card-author" : "title-page-field";
          return (
            <label key={field} className={`title-page-field-wrap title-page-field-${field}`}>
              <span>{TITLE_PAGE_FIELD_LABELS[field]}</span>
              {multilineFields.has(field)
                ? <textarea rows={field === "contact" || field === "notes" ? 3 : 2} className={className} value={fieldValue} readOnly={readOnly} placeholder={TITLE_PAGE_FIELD_LABELS[field]} onChange={(event) => setField(field, event.target.value)} />
                : <input className={className} value={fieldValue} readOnly={readOnly} placeholder={TITLE_PAGE_FIELD_LABELS[field]} onChange={(event) => setField(field, event.target.value)} />}
            </label>
          );
        })}
      </div>
      <details className="title-page-imported-fields">
        <summary>Imported and custom paragraphs ({blocks.length}; {customCount} custom)</summary>
        <p>Order, duplicate fields, paragraph attributes, and styled runs are retained for FDX export.</p>
        <ol>
          {blocks.map((block, index) => (
            <li key={`${index}-${block.type}`}>
              <label>Field type <input value={block.type} readOnly={readOnly} placeholder="Untyped" onChange={(event) => setBlocks(replaceBlock(blocks, index, { ...block, type: event.target.value }))} /></label>
              <label>Text <textarea rows={Math.max(2, block.text.split("\n").length)} value={block.text} readOnly={readOnly} onChange={(event) => onChange(updateTitlePageBlockText(value, index, event.target.value))} /></label>
              <div className="title-page-block-meta">
                {block.textRuns?.length ? <span>{block.textRuns.length} styled run{block.textRuns.length === 1 ? "" : "s"}</span> : <span>Plain text</span>}
                {Object.keys(block.metadata).length ? <span>{Object.keys(block.metadata).length} paragraph attribute{Object.keys(block.metadata).length === 1 ? "" : "s"}</span> : null}
              </div>
              {!readOnly ? <div className="title-page-block-actions">
                <button type="button" disabled={index === 0} onClick={() => setBlocks(moveBlock(blocks, index, index - 1))}>Move up</button>
                <button type="button" disabled={index === blocks.length - 1} onClick={() => setBlocks(moveBlock(blocks, index, index + 1))}>Move down</button>
                <button type="button" onClick={() => setBlocks(blocks.filter((_, blockIndex) => blockIndex !== index))}>Remove paragraph</button>
              </div> : null}
            </li>
          ))}
        </ol>
        {!readOnly ? <button type="button" onClick={() => setBlocks([...blocks, { type: "Custom", text: "", metadata: {} }])}>Add custom paragraph</button> : null}
      </details>
    </section>
  );
}

function replaceBlock(blocks: readonly TitlePageBlock[], index: number, block: TitlePageBlock): TitlePageBlock[] {
  return blocks.map((candidate, blockIndex) => blockIndex === index ? block : candidate);
}

function moveBlock(blocks: readonly TitlePageBlock[], from: number, to: number): TitlePageBlock[] {
  const next = [...blocks];
  const [block] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(to, next.length)), 0, block);
  return next;
}

function canonicalBlockType(type: string): boolean {
  const normalized = type.toLowerCase().replace(/[^a-z]/g, "");
  return ["title", "credit", "author", "authors", "writtenby", "source", "draftdate", "contact", "contactinfo", "copyright", "notes"].includes(normalized);
}
