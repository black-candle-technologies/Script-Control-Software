import { useId, type ReactNode } from "react";

interface CollapsibleSectionProps {
  id: string;
  title: ReactNode;
  summary?: ReactNode;
  summaryTone?: "neutral" | "warning" | "success";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  className?: string;
  headingLevel?: 3 | 4;
}

/** Accessible, controlled disclosure whose children remain mounted while hidden. */
export default function CollapsibleSection({
  id,
  title,
  summary,
  summaryTone = "neutral",
  open,
  onOpenChange,
  children,
  className = "",
  headingLevel = 3,
}: CollapsibleSectionProps) {
  const reactId = useId().replace(/:/g, "");
  const triggerId = `${id}-${reactId}-trigger`;
  const panelId = `${id}-${reactId}-panel`;
  const Heading = headingLevel === 4 ? "h4" : "h3";
  return <section className={`collapsible-section ${className}`.trim()} data-section-id={id}>
    <Heading className="collapsible-section-heading">
      <button
        type="button"
        id={triggerId}
        className="collapsible-section-trigger"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => onOpenChange(!open)}
      >
        <span className="collapsible-section-chevron" aria-hidden="true">{open ? "−" : "+"}</span>
        <span>{title}</span>
        {summary !== undefined ? <span className={`collapsible-section-summary ${summaryTone}`}>{summary}</span> : null}
      </button>
    </Heading>
    <div
      id={panelId}
      className="collapsible-section-content"
      role="region"
      aria-labelledby={triggerId}
      hidden={!open}
    >
      {children}
    </div>
  </section>;
}
