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
