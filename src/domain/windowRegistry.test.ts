import assert from "node:assert/strict";
import test from "node:test";
import {
  clampWindowGeometry,
  closeProjectWindow,
  createNativeWindowLabel,
  createProjectWindowRegistry,
  isSafeNativeWindowLabel,
  projectWindowMenuEntries,
  registerProjectWindow,
  updateProjectWindow,
} from "./windowRegistry.ts";

test("window registration uses collision-resistant safe labels and stable slots", () => {
  let registry = createProjectWindowRegistry("project");
  const first = registerProjectWindow(registry, { windowId: "main", label: "scs-workspace-main", slotId: "primary", focusedAt: 1 });
  registry = first.registry;
  const second = registerProjectWindow(registry, { windowId: "secondary", label: createNativeWindowLabel(2, "ABC-def"), focusedAt: 2 });
  registry = second.registry;
  assert.equal(first.window.isLeader, true);
  assert.equal(second.window.isLeader, false);
  assert.equal(isSafeNativeWindowLabel(second.window.label), true);
  assert.equal(second.window.label.includes("abc"), true);
  assert.throws(() => registerProjectWindow(registry, { label: second.window.label }), /already/i);
  assert.throws(() => registerProjectWindow(registry, { label: "screenplay title!" }), /invalid/i);
});

test("closing the leader promotes the earliest survivor and final close is explicit", () => {
  let registry = createProjectWindowRegistry("project");
  for (const [windowId, label] of [["main", "scs-workspace-main"], ["two", "scs-workspace-two"], ["three", "scs-workspace-three"]] as const) {
    registry = registerProjectWindow(registry, { windowId, label }).registry;
  }
  const primaryFirst = closeProjectWindow(registry, "main");
  assert.equal(primaryFirst.disposition, "leader-promoted");
  assert.equal(primaryFirst.promotedWindowId, "two");
  assert.equal(primaryFirst.registry.windows.find((window) => window.windowId === "two")?.isLeader, true);
  const secondary = closeProjectWindow(primaryFirst.registry, "three");
  assert.equal(secondary.disposition, "secondary-closed");
  const final = closeProjectWindow(secondary.registry, "two");
  assert.equal(final.disposition, "final-window");
});

test("view revisions never move backward and Window menu lists focusable windows", () => {
  let registry = registerProjectWindow(createProjectWindowRegistry("project"), { windowId: "main", label: "scs-workspace-main" }).registry;
  registry = registerProjectWindow(registry, { windowId: "two", label: "scs-workspace-two" }).registry;
  registry = updateProjectWindow(registry, "two", { viewRevision: 4, focusedAt: 20 });
  registry = updateProjectWindow(registry, "two", { viewRevision: 2 });
  assert.equal(registry.windows[1].viewRevision, 4);
  assert.deepEqual(projectWindowMenuEntries(registry, "two", { two: "Draft B" }).map(({ title, active, leader }) => ({ title, active, leader })), [
    { title: "Window 1", active: false, leader: true },
    { title: "Draft B", active: true, leader: false },
  ]);
});

test("geometry restoration clamps missing monitors, offscreen coordinates, and minimum sizes", () => {
  const monitors = [
    { id: "primary", x: 0, y: 0, width: 1920, height: 1040, primary: true },
    { id: "right", x: 1920, y: 0, width: 1280, height: 720 },
  ];
  assert.deepEqual(clampWindowGeometry({ x: 5000, y: -200, width: 200, height: 100, monitorId: "missing" }, monitors), {
    x: 940, y: 0, width: 980, height: 620, monitorId: "primary",
  });
  assert.deepEqual(clampWindowGeometry({ x: 2100, y: 20, width: 1100, height: 680 }, monitors), {
    x: 2100, y: 20, width: 1100, height: 680, monitorId: "right",
  });
  const tinyMonitor = clampWindowGeometry(undefined, [{ id: "tiny", x: 10, y: 20, width: 800, height: 500, primary: true }]);
  assert.deepEqual(tinyMonitor, { x: 10, y: 20, width: 800, height: 500, monitorId: "tiny" });
});
