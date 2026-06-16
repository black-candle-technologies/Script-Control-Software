import { test } from "node:test";
import assert from "node:assert/strict";

import { foundationSignals } from "./foundation.ts";
import { workspacePanels } from "./panels.ts";
import { statusLabels } from "./status.ts";

test("foundation signals only use known statuses", () => {
  for (const signal of foundationSignals) {
    assert.ok(signal.status in statusLabels, `${signal.id} has an unknown status`);
  }
});

test("the runtime stack is reported as active", () => {
  const active = foundationSignals.filter((s) => s.status === "active").map((s) => s.id);
  assert.deepEqual(active.sort(), ["backend", "frontend", "tauri"]);
});

test("storage choices are still planned, not overstated", () => {
  const byId = Object.fromEntries(foundationSignals.map((s) => [s.id, s.status]));
  assert.equal(byId["sqlite"], "planned");
  assert.equal(byId["json-portability"], "planned");
});

test("all eight workspace panels are present and planned", () => {
  const titles = workspacePanels.map((p) => p.title);
  assert.deepEqual(titles, [
    "Screenplay",
    "Beat Board",
    "Treatment",
    "Characters",
    "Objects / Props",
    "Locations",
    "Versions",
    "Breakdowns",
  ]);
  assert.ok(workspacePanels.every((p) => p.status === "planned"));
});
