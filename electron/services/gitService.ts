import fs from "node:fs/promises";
import path from "node:path";
import type { GitOperationProgress, PublishFolderInput, RepoStatus } from "../shared/types.js";
import { accountStore } from "./accountStore.js";
import { ensureGitRepoInitialized, gitHttpAuthEnv, gitStatusPorcelainV2, runGit } from "./gitShell.js";
import type { CloneRepoInput, CloneRepoResult } from "../shared/types.js";

export const getRepoStatus = async (repoPath: string): Promise<RepoStatus> => {
  const status = await gitStatusPorcelainV2(repoPath);
  return status;
};

export const publishFolderToRemote = async (
  input: PublishFolderInput,
  onProgress?: (p: GitOperationProgress) => void
): Promise<void> => {
  const opId = input.opId || "publish";
  const emit = (p: Omit<GitOperationProgress, "opId">) => onProgress?.({ opId, ...p });
  const folderPath = input.folderPath;
  const remoteUrl = input.remoteUrl;
  const branch = input.branch || "main";

  emit({ phase: "prepare", message: "Preparing local repository…" });
  await fs.mkdir(folderPath, { recursive: true });
  await ensureGitRepoInitialized(folderPath, branch);

  let pushEnv: NodeJS.ProcessEnv | undefined;
  try {
    const remote = new URL(remoteUrl);
    if (remote.protocol === "http:" || remote.protocol === "https:") {
      const account = await accountStore.getActiveAccount();
      if (account) {
        const accountHost = new URL(account.baseUrl).host;
        if (accountHost === remote.host) {
          pushEnv = await gitHttpAuthEnv(account.login, account.token);
        }
      }
    }
  } catch {
    pushEnv = undefined;
  }

  emit({ phase: "remote", message: "Configuring remote…" });
  const remotes = await runGit(["remote"], folderPath);
  const hasOrigin = remotes.stdout.split(/\r?\n/).some((r) => r.trim() === "origin");
  if (hasOrigin) {
    await runGit(["remote", "set-url", "origin", remoteUrl], folderPath);
  } else {
    await runGit(["remote", "add", "origin", remoteUrl], folderPath);
  }

  emit({ phase: "stage", message: "Staging files…" });
  await runGit(["add", "-A"], folderPath);
  const status = await runGit(["status", "--porcelain"], folderPath);
  const changedFiles = status.stdout
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean).length;
  if (changedFiles > 0) {
    emit({ phase: "commit", message: `Creating commit…`, fileCount: changedFiles });
    await runGit(["commit", "-m", input.initialCommitMessage || "Initial commit"], folderPath);
  } else {
    emit({ phase: "commit", message: "No local changes to commit.", fileCount: 0 });
  }

  emit({ phase: "push", message: "Pushing to remote…" });
  try {
    await runGit(["push", "-u", "origin", `HEAD:${branch}`], folderPath, { env: pushEnv });
  } catch {
    await runGit(["push", "-u", "origin", branch], folderPath, { env: pushEnv });
  }

  emit({ phase: "done", message: "Publish complete." });
};

export const cloneRepoToFolder = async (input: CloneRepoInput): Promise<CloneRepoResult> => {
  const destinationPath = path.join(input.parentPath, input.folderName);
  await fs.mkdir(input.parentPath, { recursive: true });

  let env: NodeJS.ProcessEnv | undefined;
  try {
    const remote = new URL(input.remoteUrl);
    if (remote.protocol === "http:" || remote.protocol === "https:") {
      const account = await accountStore.getActiveAccount();
      if (account) {
        const accountHost = new URL(account.baseUrl).host;
        if (accountHost === remote.host) {
          env = await gitHttpAuthEnv(account.login, account.token);
        }
      }
    }
  } catch {
    env = undefined;
  }

  const branch = input.branch?.trim();
  const args = branch
    ? ["clone", "--branch", branch, "--single-branch", input.remoteUrl, destinationPath]
    : ["clone", input.remoteUrl, destinationPath];
  await runGit(args, input.parentPath, { env });
  return { repoPath: destinationPath };
};
