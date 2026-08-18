import assert from "node:assert/strict";
import test from "node:test";
import { parseWorkspaceBootstrap } from "./workspaceIdentity.ts";

test("secondary-window bootstrap accepts only complete identifier-only query state", () => {
  assert.deepEqual(parseWorkspaceBootstrap("?scsProjectId=project-1&scsSessionId=session-2&scsWindowId=window-3&scsSlotId=slot-4"), {
    projectId: "project-1", sessionId: "session-2", windowId: "window-3", slotId: "slot-4",
  });
  assert.equal(parseWorkspaceBootstrap("?scsProjectId=project&scsWindowId=window&scsSlotId=slot"), undefined);
  assert.equal(parseWorkspaceBootstrap("?scsProjectId=../project&scsSessionId=session&scsWindowId=window&scsSlotId=slot"), undefined);
});
