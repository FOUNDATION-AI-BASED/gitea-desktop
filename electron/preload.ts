import { contextBridge, ipcRenderer } from "electron";
import type {
  AccountSummary,
  CloneRepoInput,
  CloneRepoResult,
  CreateBranchInput,
  CreateRepoInput,
  GiteaOwner,
  GiteaRepo,
  GitOperationProgress,
  PublishFolderInput,
  RepoOpenCounts,
  RepoStatus
} from "./shared/types.js";
import type { AppSettings } from "./services/settingsStore.js";

const api = {
  auth: {
    getAccounts: (): Promise<AccountSummary[]> => ipcRenderer.invoke("auth:getAccounts"),
    setActiveAccount: (accountId: string): Promise<void> => ipcRenderer.invoke("auth:setActiveAccount", accountId),
    getActiveAccount: (): Promise<AccountSummary | null> => ipcRenderer.invoke("auth:getActiveAccount"),
    loginWithToken: (baseUrl: string, token: string): Promise<AccountSummary> =>
      ipcRenderer.invoke("auth:loginWithToken", { baseUrl, token }),
    loginWithPassword: (baseUrl: string, username: string, password: string): Promise<AccountSummary> =>
      ipcRenderer.invoke("auth:loginWithPassword", { baseUrl, username, password }),
    loginWithOAuth: (baseUrl: string, clientId: string, clientSecret?: string): Promise<AccountSummary> =>
      ipcRenderer.invoke("auth:loginWithOAuth", { baseUrl, clientId, clientSecret }),
    logout: (accountId: string): Promise<void> => ipcRenderer.invoke("auth:logout", accountId)
  },
  gitea: {
    listRepos: (): Promise<GiteaRepo[]> => ipcRenderer.invoke("gitea:listRepos"),
    listOwners: (): Promise<GiteaOwner[]> => ipcRenderer.invoke("gitea:listOwners"),
    createRepo: (input: CreateRepoInput): Promise<GiteaRepo> => ipcRenderer.invoke("gitea:createRepo", input),
    listBranches: (owner: string, repo: string): Promise<string[]> => ipcRenderer.invoke("gitea:listBranches", { owner, repo }),
    createBranch: (input: CreateBranchInput): Promise<void> => ipcRenderer.invoke("gitea:createBranch", input),
    getRepoOpenCounts: (owner: string, repo: string): Promise<RepoOpenCounts> =>
      ipcRenderer.invoke("gitea:getRepoOpenCounts", { owner, repo })
  },
  settings: {
    get: (): Promise<AppSettings> => ipcRenderer.invoke("settings:get"),
    setDevToolsEnabled: (enabled: boolean): Promise<AppSettings> =>
      ipcRenderer.invoke("settings:setDevToolsEnabled", { enabled }),
    setOauthClientId: (clientId: string): Promise<AppSettings> => ipcRenderer.invoke("settings:setOauthClientId", { clientId }),
    setOauthClientSecret: (clientSecret: string): Promise<AppSettings> =>
      ipcRenderer.invoke("settings:setOauthClientSecret", { clientSecret })
  },
  git: {
    getStatus: (repoPath: string): Promise<RepoStatus> => ipcRenderer.invoke("git:getStatus", { repoPath }),
    publishFolder: (input: PublishFolderInput): Promise<void> => ipcRenderer.invoke("git:publishFolder", input),
    cloneRepo: (input: CloneRepoInput): Promise<CloneRepoResult> => ipcRenderer.invoke("git:cloneRepo", input),
    chooseFolder: (): Promise<string | null> => ipcRenderer.invoke("ui:chooseFolder"),
    watchStatus: (repoPath: string): Promise<void> => ipcRenderer.invoke("git:watchStatus", { repoPath }),
    unwatchStatus: (repoPath: string): Promise<void> => ipcRenderer.invoke("git:unwatchStatus", { repoPath }),
    onStatusChanged: (listener: (payload: { repoPath: string; status: RepoStatus }) => void) => {
      const handler = (_evt: unknown, payload: { repoPath: string; status: RepoStatus }) => listener(payload);
      ipcRenderer.on("git:statusChanged", handler);
      return () => ipcRenderer.removeListener("git:statusChanged", handler);
    },
    onOperationProgress: (listener: (payload: GitOperationProgress) => void) => {
      const handler = (_evt: unknown, payload: GitOperationProgress) => listener(payload);
      ipcRenderer.on("git:operationProgress", handler);
      return () => ipcRenderer.removeListener("git:operationProgress", handler);
    }
  }
};

contextBridge.exposeInMainWorld("giteaDesktop", api);

export type GiteaDesktopApi = typeof api;
