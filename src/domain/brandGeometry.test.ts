import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  BRAND_MARK_FRAME_BOUNDS,
  BRAND_MARK_FRAME_PATH,
  BRAND_MARK_LETTERING_BOUNDS,
  BRAND_MARK_LETTERING_PATH,
  BRAND_MARK_OUTLINE_PATH,
  BRAND_MARK_VIEW_BOX,
  geometryCenter,
} from "./brandGeometry.ts";

test("canonical frame and path lettering share one center at every scale", () => {
  const frameCenter = geometryCenter(BRAND_MARK_FRAME_BOUNDS);
  const letteringCenter = geometryCenter(BRAND_MARK_LETTERING_BOUNDS);
  assert.deepEqual(frameCenter, { x: 32, y: 32 });
  assert.deepEqual(letteringCenter, frameCenter);

  for (const size of [16, 20, 32, 56, 112]) {
    for (const zoom of [0.8, 1, 1.25, 2]) {
      for (const deviceScale of [1, 1.5, 2]) {
        const scale = size / 64 * zoom * deviceScale;
        assert.equal(frameCenter.x * scale, letteringCenter.x * scale);
        assert.equal(frameCenter.y * scale, letteringCenter.y * scale);
      }
    }
  }
});

test("the favicon uses the exact canonical path geometry and no font text", () => {
  const asset = readFileSync(new URL("../../public/scs.svg", import.meta.url), "utf8");
  assert.match(asset, new RegExp(`viewBox=["']${BRAND_MARK_VIEW_BOX}["']`));
  assert.ok(asset.includes(`d="${BRAND_MARK_FRAME_PATH}"`));
  assert.ok(asset.includes(`d="${BRAND_MARK_OUTLINE_PATH}"`));
  assert.ok(asset.includes(`d="${BRAND_MARK_LETTERING_PATH}"`));
  assert.doesNotMatch(asset, /<text\b/i);
});
