import type { BrowserWindow, IpcMain } from "electron";
import { dialog, app } from "electron";
import type { CreateBranchInput, CreateRepoInput, PublishFolderInput } from "./shared/types.js";
import {
  createAccountFromPassword,
  createAccountFromToken,
  createBranchForActiveAccount,
  createRepoForActiveAccount,
  getRepoOpenCountsForActiveAccount,
  listBranchesForActiveAccount,
  listOwnersForActiveAccount,
  listReposForActiveAccount
} from "./services/giteaAuth.js";
import { accountStore } from "./services/accountStore.js";
import { cloneRepoToFolder, getRepoStatus, publishFolderToRemote } from "./services/gitService.js";
import { settingsStore } from "./services/settingsStore.js";
import { oauthLoginWithPkce } from "./services/giteaOAuth.js";
import chokidar from "chokidar";

export const registerIpc = (ipcMain: IpcMain, mainWindow: BrowserWindow) => {
  const watchers = new Map<string, chokidar.FSWatcher>();

  const sendToRenderer = (channel: string, payload: unknown) => {
    if (mainWindow.isDestroyed()) return;
    mainWindow.webContents.send(channel, payload);
  };

  ipcMain.handle("auth:getAccounts", async () => {
    const accounts = await accountStore.getAccounts();
    return accounts.map((a) => ({ id: a.id, baseUrl: a.baseUrl, login: a.login, displayName: a.displayName }));
  });

  ipcMain.handle("auth:getActiveAccount", async () => {
    const account = await accountStore.getActiveAccount();
    if (!account) return null;
    return { id: account.id, baseUrl: account.baseUrl, login: account.login, displayName: account.displayName };
  });

  ipcMain.handle("auth:setActiveAccount", async (_evt, accountId: string) => {
    await accountStore.setActiveAccountId(accountId);
  });

  ipcMain.handle("auth:loginWithToken", async (_evt, input: { baseUrl: string; token: string }) => {
    const account = await createAccountFromToken(input.baseUrl, input.token);
    await accountStore.upsertAccount(account);
    await accountStore.setActiveAccountId(account.id);
    return { id: account.id, baseUrl: account.baseUrl, login: account.login, displayName: account.displayName };
  });

  ipcMain.handle(
    "auth:loginWithPassword",
    async (_evt, input: { baseUrl: string; username: string; password: string }) => {
      const account = await createAccountFromPassword(input.baseUrl, input.username, input.password);
      await accountStore.upsertAccount(account);
      await accountStore.setActiveAccountId(account.id);
      return { id: account.id, baseUrl: account.baseUrl, login: account.login, displayName: account.displayName };
    }
  );

  ipcMain.handle("auth:loginWithOAuth", async (_evt, input: { baseUrl: string; clientId: string; clientSecret?: string }) => {
    const token = await oauthLoginWithPkce(input.baseUrl, input.clientId, input.clientSecret);
    const account = await createAccountFromToken(input.baseUrl, token);
    await accountStore.upsertAccount(account);
    await accountStore.setActiveAccountId(account.id);
    return { id: account.id, baseUrl: account.baseUrl, login: account.login, displayName: account.displayName };
  });

  ipcMain.handle("auth:logout", async (_evt, accountId: string) => {
    const active = await accountStore.getActiveAccount();
    await accountStore.deleteAccount(accountId);
    if (active?.id === accountId) {
      const remaining = await accountStore.getAccounts();
      await accountStore.setActiveAccountId(remaining[0]?.id ?? null);
    }
  });

  ipcMain.handle("gitea:listRepos", async () => listReposForActiveAccount());
  ipcMain.handle("gitea:listOwners", async () => listOwnersForActiveAccount());
  ipcMain.handle("gitea:createRepo", async (_evt, input: CreateRepoInput) => createRepoForActiveAccount(input));
  ipcMain.handle("gitea:listBranches", async (_evt, input: { owner: string; repo: string }) =>
    listBranchesForActiveAccount(input.owner, input.repo)
  );
  ipcMain.handle("gitea:createBranch", async (_evt, input: CreateBranchInput) => createBranchForActiveAccount(input));
  ipcMain.handle("gitea:getRepoOpenCounts", async (_evt, input: { owner: string; repo: string }) =>
    getRepoOpenCountsForActiveAccount(input.owner, input.repo)
  );

  ipcMain.handle("settings:get", async () => settingsStore.getSettings());
  ipcMain.handle("settings:setDevToolsEnabled", async (_evt, input: { enabled: boolean }) => {
    const settings = await settingsStore.setDevToolsEnabled(Boolean(input.enabled));
    if (settings.devToolsEnabled) {
      if (!mainWindow.webContents.isDevToolsOpened()) mainWindow.webContents.openDevTools({ mode: "detach" });
    } else {
      if (mainWindow.webContents.isDevToolsOpened()) mainWindow.webContents.closeDevTools();
    }
    return settings;
  });
  ipcMain.handle("settings:setOauthClientId", async (_evt, input: { clientId: string }) => {
    const settings = await settingsStore.setOauthClientId(String(input.clientId ?? ""));
    return settings;
  });
  ipcMain.handle("settings:setOauthClientSecret", async (_evt, input: { clientSecret: string }) => {
    const settings = await settingsStore.setOauthClientSecret(String(input.clientSecret ?? ""));
    return settings;
  });

  ipcMain.handle("git:getStatus", async (_evt, input: { repoPath: string }) => getRepoStatus(input.repoPath));
  ipcMain.handle("git:publishFolder", async (_evt, input: PublishFolderInput) => {
    try {
      await publishFolderToRemote(input, (p) => sendToRenderer("git:operationProgress", p));
    } catch (e) {
      sendToRenderer("git:operationProgress", {
        opId: input.opId || "publish",
        phase: "error",
        message: "Publish failed. See console for details."
      });
      throw e;
    }
  });
  ipcMain.handle("git:cloneRepo", async (_evt, input) => cloneRepoToFolder(input));
  ipcMain.handle("git:watchStatus", async (_evt, input: { repoPath: string }) => {
    const repoPath = input.repoPath;

    const existing = watchers.get(repoPath);
    if (existing) {
      await existing.close().catch(() => undefined);
      watchers.delete(repoPath);
    }

    let debounceId: NodeJS.Timeout | null = null;
    const queueUpdate = () => {
      if (debounceId) clearTimeout(debounceId);
      debounceId = setTimeout(async () => {
        debounceId = null;
        try {
          const status = await getRepoStatus(repoPath);
          sendToRenderer("git:statusChanged", { repoPath, status });
        } catch (e) {
          sendToRenderer("git:statusError", { repoPath, error: String(e) });
        }
      }, 250);
    };

    const watcher = chokidar.watch(
      [
        `${repoPath}/**/*`,
        `${repoPath}/.git/HEAD`,
        `${repoPath}/.git/index`,
        `${repoPath}/.git/refs/**/*`
      ],
      {
        ignoreInitial: true,
        ignored: [
          "**/node_modules/**",
          "**/.git/objects/**",
          "**/.git/logs/**",
          "**/.git/hooks/**",
          "**/.git/info/**",
          "**/.git/packed-refs"
        ]
      }
    );

    watcher.on("all", queueUpdate);
    watcher.on("error", (err) => sendToRenderer("git:statusError", { repoPath, error: String(err) }));
    watchers.set(repoPath, watcher);

    queueUpdate();
  });

  ipcMain.handle("git:unwatchStatus", async (_evt, input: { repoPath: string }) => {
    const existing = watchers.get(input.repoPath);
    if (!existing) return;
    await existing.close().catch(() => undefined);
    watchers.delete(input.repoPath);
  });

  ipcMain.handle("ui:chooseFolder", async () => {
    const result = await dialog.showOpenDialog({
      title: "Choose a folder",
      defaultPath: app.getPath("home"),
      properties: ["openDirectory"]
    });
    if (result.canceled) return null;
    return result.filePaths[0] ?? null;
  });
};
