import assert from "node:assert/strict";
import test from "node:test";
import { clearSession, loadSession, saveSession } from "./storage.ts";
import { createProjectSession, emptyDocument } from "./domain/index.ts";

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

test("the full project session survives emergency local storage", () => {
  Object.defineProperty(globalThis, "localStorage", { value: new MemoryStorage(), configurable: true });
  const session = createProjectSession(emptyDocument("Pilot"), "television");
  session.workspace.series.showBible = "Canon";
  assert.equal(saveSession(session), true);
  assert.equal(loadSession()?.workspace.series.showBible, "Canon");
  clearSession();
  assert.equal(loadSession(), null);
});

test("recovery snapshots are isolated by project and the latest remains discoverable", () => {
  Object.defineProperty(globalThis, "localStorage", { value: new MemoryStorage(), configurable: true });
  const alpha = createProjectSession(emptyDocument("Alpha"));
  const beta = createProjectSession(emptyDocument("Beta"));
  alpha.name = "Alpha project";
  beta.name = "Beta project";

  assert.equal(saveSession(alpha), true);
  assert.equal(saveSession(beta), true);
  assert.equal(loadSession(alpha.projectId)?.name, "Alpha project");
  assert.equal(loadSession(beta.projectId)?.name, "Beta project");
  assert.equal(loadSession()?.projectId, beta.projectId);

  clearSession(beta.projectId);
  assert.equal(loadSession(beta.projectId), null);
  assert.equal(loadSession(alpha.projectId)?.name, "Alpha project");
});

test("the legacy global recovery slot migrates into project-scoped storage", () => {
  const storage = new MemoryStorage();
  Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });
  const legacy = createProjectSession(emptyDocument("Legacy"));
  legacy.name = "Migrated project";
  storage.setItem("scs.project-session.v3", JSON.stringify(legacy));

  assert.equal(loadSession()?.projectId, legacy.projectId);
  assert.equal(loadSession(legacy.projectId)?.name, "Migrated project");
  assert.equal(storage.getItem("scs.project-session.v3"), null);
});
