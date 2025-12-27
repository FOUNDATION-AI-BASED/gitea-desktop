/// <reference types="vite/client" />

import type {
  Account,
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
} from "../shared/types";

type GiteaDesktopApi = {
  auth: {
    getAccounts: () => Promise<Account[]>;
    setActiveAccount: (accountId: string) => Promise<void>;
    getActiveAccount: () => Promise<Account | null>;
    loginWithToken: (baseUrl: string, token: string) => Promise<Account>;
    loginWithPassword: (baseUrl: string, username: string, password: string) => Promise<Account>;
    loginWithOAuth: (baseUrl: string, clientId: string, clientSecret?: string) => Promise<Account>;
    logout: (accountId: string) => Promise<void>;
  };
  gitea: {
    listRepos: () => Promise<GiteaRepo[]>;
    listOwners: () => Promise<GiteaOwner[]>;
    createRepo: (input: CreateRepoInput) => Promise<GiteaRepo>;
    listBranches: (owner: string, repo: string) => Promise<string[]>;
    createBranch: (input: CreateBranchInput) => Promise<void>;
    getRepoOpenCounts: (owner: string, repo: string) => Promise<RepoOpenCounts>;
  };
  settings: {
    get: () => Promise<{ devToolsEnabled: boolean; oauthClientId: string; oauthClientSecret: string }>;
    setDevToolsEnabled: (enabled: boolean) => Promise<{ devToolsEnabled: boolean; oauthClientId: string; oauthClientSecret: string }>;
    setOauthClientId: (clientId: string) => Promise<{ devToolsEnabled: boolean; oauthClientId: string; oauthClientSecret: string }>;
    setOauthClientSecret: (clientSecret: string) => Promise<{ devToolsEnabled: boolean; oauthClientId: string; oauthClientSecret: string }>;
  };
  git: {
    getStatus: (repoPath: string) => Promise<RepoStatus>;
    publishFolder: (input: PublishFolderInput) => Promise<void>;
    cloneRepo: (input: CloneRepoInput) => Promise<CloneRepoResult>;
    chooseFolder: () => Promise<string | null>;
    watchStatus: (repoPath: string) => Promise<void>;
    unwatchStatus: (repoPath: string) => Promise<void>;
    onStatusChanged: (listener: (payload: { repoPath: string; status: RepoStatus }) => void) => () => void;
    onOperationProgress: (listener: (payload: GitOperationProgress) => void) => () => void;
  };
};

declare global {
  interface Window {
    giteaDesktop: GiteaDesktopApi;
  }
}
