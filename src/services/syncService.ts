import { invoke } from "@tauri-apps/api/core";

export interface GitSyncStatus {
  initialized: boolean;
  branch?: string;
  head?: string;
  upstream?: string;
  hasRemote: boolean;
  remoteUrl?: string;
  remoteSafe: boolean;
  ahead: number;
  behind: number;
  staged: number;
  modified: number;
  untracked: number;
  conflicts: number;
  dirty: boolean;
}

export interface GitSyncResult {
  message: string;
  status: GitSyncStatus;
}

export const gitSyncStatus = (projectPath: string) => invoke<GitSyncStatus>("git_sync_status", { projectPath });
export const gitSyncInit = (projectPath: string, branch: string, remoteUrl?: string) => invoke<GitSyncResult>("git_sync_init", { projectPath, branch, remoteUrl: remoteUrl?.trim() || null });
export const gitSyncCommit = (projectPath: string, branch: string, message: string, authorName: string, authorEmail: string) => invoke<GitSyncResult>("git_sync_commit", { projectPath, branch, message, authorName, authorEmail });
export const gitSyncPull = (projectPath: string, branch: string) => invoke<GitSyncResult>("git_sync_pull", { projectPath, branch });
export const gitSyncPush = (projectPath: string, branch: string) => invoke<GitSyncResult>("git_sync_push", { projectPath, branch });
