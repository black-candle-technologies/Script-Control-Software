/** Canonical, font-independent geometry for every visible SCS brand mark. */
export const BRAND_MARK_VIEW_BOX = "0 0 64 64";

export const BRAND_MARK_FRAME_PATH = "M12 4H52C56.418 4 60 7.582 60 12V52C60 56.418 56.418 60 52 60H12C7.582 60 4 56.418 4 52V12C4 7.582 7.582 4 12 4Z";

export const BRAND_MARK_OUTLINE_PATH = "M12 5H52C55.866 5 59 8.134 59 12V52C59 55.866 55.866 59 52 59H12C8.134 59 5 55.866 5 52V12C5 8.134 8.134 5 12 5Z";

/**
 * Three custom block glyphs. Their combined bounds are x=11…53, y=21…43,
 * so both the mathematical and perceived center match the frame at (32,32).
 */
export const BRAND_MARK_LETTERING_PATH = "M22 21H11V34H18V39H11V43H22V30H15V25H22ZM38 21H26V43H38V39H30V25H38ZM53 21H42V34H49V39H42V43H53V30H46V25H53Z";

export interface BrandGeometryBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const BRAND_MARK_FRAME_BOUNDS: Readonly<BrandGeometryBounds> = { x: 4, y: 4, width: 56, height: 56 };
export const BRAND_MARK_LETTERING_BOUNDS: Readonly<BrandGeometryBounds> = { x: 11, y: 21, width: 42, height: 22 };

export function geometryCenter(bounds: BrandGeometryBounds): Readonly<{ x: number; y: number }> {
  return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
}
