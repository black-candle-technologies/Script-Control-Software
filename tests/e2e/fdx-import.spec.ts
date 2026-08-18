import { expect, test, type Page } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test("launcher FDX action calls its handler without the React click event", async ({ page }) => {
  await page.evaluate(async () => {
    const [launcherModule, reactModule, clientModule] = await Promise.all([
      import("/src/components/Launcher.tsx"),
      import("/@id/react"),
      import("/@id/react-dom/client"),
    ]);
    const Launcher = launcherModule.default;
    const React = reactModule.default;
    const { createRoot } = clientModule.default;
    const state = window as unknown as { __launcherFdxArgumentCount: number };
    state.__launcherFdxArgumentCount = -1;

    const host = document.createElement("div");
    host.id = "launcher-contract-test";
    document.body.replaceChildren(host);
    createRoot(host).render(React.createElement(Launcher, {
      appInfo: {
        name: "SCS",
        short_name: "SCS",
        version: "test",
        phase: "test",
        tagline: "test",
      },
      savedTitle: null,
      onOpen: () => {},
      onOpenFdx: (...args: unknown[]) => {
        state.__launcherFdxArgumentCount = args.length;
      },
      onOpenProject: () => {},
      importError: null,
      importing: false,
    }));
  });

  await page.locator("#launcher-contract-test")
    .getByRole("button", { name: "Import Final Draft (FDX)" })
    .click();
  await expect.poll(() => page.evaluate(() => (
    window as unknown as { __launcherFdxArgumentCount: number }
  ).__launcherFdxArgumentCount)).toBe(0);
});

test("launcher imports an FDX without a beforeReplace callback", async ({ page }) => {
  await installFdxImportMock(page);

  await page.getByRole("button", { name: "Import Final Draft (FDX)" }).click();

  await expect(page.getByRole("textbox", { name: "Project name" })).toHaveValue("Launcher Import");
  await expect(page.locator("textarea.blk").first()).toHaveValue("INT. CALLBACK VERIFIED - DAY");
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("workspace FDX replacement still accepts its async beforeReplace callback", async ({ page }) => {
  await page.getByRole("button", { name: "New Feature Screenplay" }).click();
  await page.locator("textarea.blk").first().fill("INT. OLD PROJECT - DAY");
  await expect(page.locator(".save-chip")).toContainText("Saved");
  await installFdxImportMock(page);
  page.once("dialog", (dialog) => dialog.accept());

  await page.getByRole("button", { name: "Project", exact: true }).click();
  await page.getByRole("menuitem", { name: "Open FDX…" }).click();

  await expect(page.getByRole("textbox", { name: "Project name" })).toHaveValue("Launcher Import");
  await expect(page.locator("textarea.blk").first()).toHaveValue("INT. CALLBACK VERIFIED - DAY");
});

test("workspace FDX replacement honors a beforeReplace cancellation", async ({ page }) => {
  await page.getByRole("button", { name: "New Feature Screenplay" }).click();
  await page.locator("textarea.blk").first().fill("INT. KEEP THIS PROJECT - DAY");
  await expect(page.locator(".save-chip")).toContainText("Saved");
  await installFdxImportMock(page);
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new Error("Simulated recovery write failure");
    };
  });
  const dialogs: string[] = [];
  page.on("dialog", async (dialog) => {
    dialogs.push(dialog.message());
    if (dialog.message().includes("Open a different project?")) await dialog.accept();
    else await dialog.dismiss();
  });

  await page.getByRole("button", { name: "Project", exact: true }).click();
  await page.getByRole("menuitem", { name: "Open FDX…" }).click();

  await expect.poll(() => dialogs).toHaveLength(2);
  expect(dialogs[1]).toContain("could not write the emergency recovery copy");
  await expect(page.getByRole("textbox", { name: "Project name" })).toHaveValue("Untitled Screenplay");
  await expect(page.locator("textarea.blk").first()).toHaveValue("INT. KEEP THIS PROJECT - DAY");
});

async function installFdxImportMock(page: Page) {
  await page.evaluate(() => {
    const testWindow = window as unknown as {
      __TAURI_INTERNALS__?: {
        invoke: (command: string) => Promise<unknown>;
      };
    };
    testWindow.__TAURI_INTERNALS__ = {
      invoke: async (command: string) => {
        if (command === "plugin:dialog|open") return "C:/Test/launcher-import.fdx";
        if (command === "parse_fdx") {
          return {
            id: "fdx-test",
            title: "Launcher Import",
            source: {
              type: "fdx",
              path: "C:/Test/launcher-import.fdx",
              fileName: "launcher-import.fdx",
              fdxVersion: "12",
              lastImportedAt: "2026-08-18T00:00:00.000Z",
            },
            metadata: {},
            titlePage: {
              title: "Launcher Import",
              author: "Test Writer",
              blocks: [],
            },
            blocks: [{
              id: "scene-1",
              type: "scene_heading",
              text: "INT. CALLBACK VERIFIED - DAY",
              textRuns: [],
              originalType: "Scene Heading",
              metadata: {},
            }],
            scenes: [],
            characters: [],
            locations: [],
            warnings: [],
            sceneNotes: {},
            readOnly: false,
            workspace: {
              storyStructure: {
                acts: [],
                sequences: [],
                beats: [],
                sceneOrder: [],
              },
            },
          };
        }
        if (command === "file_modified_at") {
          // Presence of this object selects native coordination. Remove it before
          // App mounts the newly keyed Workspace after the mocked import.
          delete testWindow.__TAURI_INTERNALS__;
          return 123;
        }
        throw new Error(`Unexpected Tauri command: ${command}`);
      },
    };
  });
}
