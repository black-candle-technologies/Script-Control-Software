import type { Page } from "@playwright/test";

const CURRENT_PROJECT_KEY = "scs.project-session.v4.current-project";
const SESSION_KEY_PREFIX = "scs.project-session.v4:";

export async function recoverySessionText(page: Page): Promise<string | null> {
  return page.evaluate(({ currentProjectKey, sessionKeyPrefix }) => {
    const projectId = localStorage.getItem(currentProjectKey);
    return projectId ? localStorage.getItem(`${sessionKeyPrefix}${encodeURIComponent(projectId)}`) : null;
  }, { currentProjectKey: CURRENT_PROJECT_KEY, sessionKeyPrefix: SESSION_KEY_PREFIX });
}

export async function requireRecoverySessionKey(page: Page): Promise<string> {
  const key = await page.evaluate(({ currentProjectKey, sessionKeyPrefix }) => {
    const projectId = localStorage.getItem(currentProjectKey);
    return projectId ? `${sessionKeyPrefix}${encodeURIComponent(projectId)}` : null;
  }, { currentProjectKey: CURRENT_PROJECT_KEY, sessionKeyPrefix: SESSION_KEY_PREFIX });
  if (!key) throw new Error("The current project does not have a v4 recovery pointer.");
  return key;
}
