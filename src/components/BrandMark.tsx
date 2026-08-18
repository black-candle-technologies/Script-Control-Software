import type { CSSProperties, SVGProps } from "react";
import {
  BRAND_MARK_FRAME_PATH,
  BRAND_MARK_LETTERING_PATH,
  BRAND_MARK_OUTLINE_PATH,
  BRAND_MARK_VIEW_BOX,
} from "../domain/brandGeometry.ts";
import "./BrandMark.css";

type NativeSvgProps = Omit<SVGProps<SVGSVGElement>, "aria-hidden" | "aria-label" | "children" | "focusable" | "role">;

export interface BrandMarkProps extends NativeSvgProps {
  /** Hide the mark when nearby text or its containing control already supplies the name. */
  decorative?: boolean;
  /** The single accessible name used when this mark conveys identity on its own. */
  label?: string;
  /** Adds a reduced-motion-safe activity treatment without changing geometry. */
  loading?: boolean;
  size?: number | string;
}

interface BrandMarkStyle extends CSSProperties {
  "--brand-mark-size"?: string;
}

export default function BrandMark({
  className = "",
  decorative = false,
  label = "SCS",
  loading = false,
  size,
  style,
  ...rest
}: BrandMarkProps) {
  const markStyle: BrandMarkStyle = {
    ...style,
    ...(size === undefined ? {} : { "--brand-mark-size": typeof size === "number" ? `${size}px` : size }),
  };
  const classes = ["brand-mark", loading && "brand-mark--loading", className].filter(Boolean).join(" ");

  return (
    <svg
      {...rest}
      className={classes}
      style={markStyle}
      viewBox={BRAND_MARK_VIEW_BOX}
      preserveAspectRatio="xMidYMid meet"
      shapeRendering="geometricPrecision"
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : label}
      aria-hidden={decorative ? true : undefined}
      focusable="false"
      data-brand-mark="scs"
    >
      <path className="brand-mark__frame" data-brand-part="frame" d={BRAND_MARK_FRAME_PATH} />
      <path className="brand-mark__outline" d={BRAND_MARK_OUTLINE_PATH} />
      <path className="brand-mark__lettering" data-brand-part="lettering" d={BRAND_MARK_LETTERING_PATH} />
    </svg>
  );
}
