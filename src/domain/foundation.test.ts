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

test("implemented foundation capabilities are active", () => {
  const active = foundationSignals.filter((s) => s.status === "active").map((s) => s.id);
  assert.deepEqual(active.sort(), ["backend", "domain-models", "frontend", "json-portability", "project-format", "tauri"]);
});

test("optional SQLite remains planned while portable JSON is active", () => {
  const byId = Object.fromEntries(foundationSignals.map((s) => [s.id, s.status]));
  assert.equal(byId["sqlite"], "planned");
  assert.equal(byId["json-portability"], "active");
});

test("all eight core workspace panels are active", () => {
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
  assert.ok(workspacePanels.every((p) => p.status === "active"));
});
