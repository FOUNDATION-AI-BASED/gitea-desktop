import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { app } from "electron";
import type { RepoStatus } from "../shared/types.js";

type RunResult = { stdout: string; stderr: string; exitCode: number };

type RunOptions = { env?: NodeJS.ProcessEnv };

export const runGit = (args: string[], cwd: string, options: RunOptions = {}): Promise<RunResult> =>
  new Promise((resolve, reject) => {
    const proc = spawn("git", args, { cwd, windowsHide: true, env: { ...process.env, ...options.env } });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => (stdout += d.toString()));
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("error", (err) => reject(err));
    proc.on("close", (code) => {
      const exitCode = code ?? -1;
      if (exitCode === 0) resolve({ stdout, stderr, exitCode });
      else reject(new Error(`git ${args.join(" ")} failed (${exitCode}): ${stderr || stdout}`));
    });
  });

const ensureAskpassHelper = async (): Promise<string> => {
  const askpassDir = path.join(app.getPath("userData"), "askpass");
  const jsPath = path.join(askpassDir, "askpass.js");
  const wrapperPath =
    process.platform === "win32" ? path.join(askpassDir, "askpass.cmd") : path.join(askpassDir, "askpass.sh");

  await fs.mkdir(askpassDir, { recursive: true });

  const js = [
    "const prompt = process.argv.slice(2).join(' ');",
    "const username = process.env.GITEA_DESKTOP_GIT_USERNAME || '';",
    "const password = process.env.GITEA_DESKTOP_GIT_PASSWORD || '';",
    "const isUsername = /username/i.test(prompt);",
    "process.stdout.write((isUsername ? username : password) + '\\n');"
  ].join("\n");

  const wrapper =
    process.platform === "win32"
      ? ["@echo off", "node \"%~dp0askpass.js\" %*"].join("\r\n")
      : ["#!/bin/sh", "DIR=\"$(CDPATH= cd -- \"$(dirname -- \"$0\")\" && pwd)\"", "node \"$DIR/askpass.js\" \"$@\""].join(
          "\n"
        );

  await fs.writeFile(jsPath, js, "utf8");
  await fs.writeFile(wrapperPath, wrapper, "utf8");
  if (process.platform !== "win32") {
    await fs.chmod(wrapperPath, 0o755).catch(() => undefined);
  }

  return wrapperPath;
};

export const gitHttpAuthEnv = async (username: string, password: string): Promise<NodeJS.ProcessEnv> => {
  const askpass = await ensureAskpassHelper();
  return {
    GIT_ASKPASS: askpass,
    GIT_TERMINAL_PROMPT: "0",
    GCM_INTERACTIVE: "Never",
    GITEA_DESKTOP_GIT_USERNAME: username,
    GITEA_DESKTOP_GIT_PASSWORD: password
  };
};

export const ensureGitRepoInitialized = async (repoPath: string, defaultBranch: string) => {
  const gitDir = path.join(repoPath, ".git");
  try {
    await fs.stat(gitDir);
    return;
  } catch {
    await runGit(["init"], repoPath);
    try {
      await runGit(["checkout", "-b", defaultBranch], repoPath);
    } catch {
      await runGit(["branch", "-M", defaultBranch], repoPath);
    }
  }
};

const parsePorcelainV2 = (text: string): RepoStatus => {
  const lines = text.split(/\r?\n/).filter(Boolean);
  let branch: string | null = null;
  const changed: RepoStatus["changed"] = [];

  for (const line of lines) {
    if (line.startsWith("# branch.head ")) {
      const head = line.replace("# branch.head ", "").trim();
      branch = head === "(detached)" ? null : head;
      continue;
    }

    const code = line[0];
    if (code === "1" || code === "2") {
      const parts = line.split(" ");
      const xy = parts[1] ?? "";
      const filePath = parts[parts.length - 1] ?? "";
      changed.push({ path: filePath, indexStatus: xy[0] ?? "?", worktreeStatus: xy[1] ?? "?" });
      continue;
    }

    if (code === "?" && line.startsWith("? ")) {
      const filePath = line.slice(2).trim();
      changed.push({ path: filePath, indexStatus: "?", worktreeStatus: "?" });
    }
  }

  return { branch, changed };
};

export const gitStatusPorcelainV2 = async (repoPath: string): Promise<RepoStatus> => {
  const res = await runGit(["status", "--porcelain=v2", "--branch"], repoPath);
  return parsePorcelainV2(res.stdout);
};
