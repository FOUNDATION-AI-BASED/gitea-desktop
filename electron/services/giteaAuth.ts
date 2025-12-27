import crypto from "node:crypto";
import type { Account, CreateBranchInput, CreateRepoInput, GiteaOwner, GiteaRepo, RepoOpenCounts } from "../shared/types.js";
import { GiteaClient } from "./giteaClient.js";
import { accountStore } from "./accountStore.js";

export const createAccountFromToken = async (baseUrl: string, token: string): Promise<Account> => {
  const trimmed = token.trim();
  const client = new GiteaClient(baseUrl, trimmed);
  const user = await client.getCurrentUser();
  const id = crypto.createHash("sha256").update(`${baseUrl}|${user.id}`).digest("hex");
  return {
    id,
    baseUrl: baseUrl.replace(/\/+$/, ""),
    login: user.login,
    displayName: user.full_name || user.login,
    token: trimmed
  };
};

const createTokenWithBasicAuth = async (baseUrl: string, username: string, password: string): Promise<string> => {
  const normalized = baseUrl.replace(/\/+$/, "");
  const url = new URL(normalized);
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/api/v1/users/${encodeURIComponent(username)}/tokens`;

  const basic = Buffer.from(`${username}:${password}`).toString("base64");
  const tryCreate = async (name: string) => {
    const res = await fetch(url.toString(), {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ name })
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Gitea API error ${res.status}: ${text || res.statusText}`);
    }
    const json = (await res.json()) as Record<string, unknown>;
    const token =
      (typeof json.sha1 === "string" && json.sha1) ||
      (typeof json.token === "string" && json.token) ||
      (typeof json.value === "string" && json.value) ||
      "";
    if (!token) throw new Error("Gitea API did not return a token");
    return token;
  };

  try {
    return await tryCreate("Gitea Desktop");
  } catch {
    return tryCreate(`Gitea Desktop ${new Date().toISOString()}`);
  }
};

export const createAccountFromPassword = async (
  baseUrl: string,
  username: string,
  password: string
): Promise<Account> => {
  const token = await createTokenWithBasicAuth(baseUrl, username, password);
  return createAccountFromToken(baseUrl, token);
};

export const listReposForActiveAccount = async (): Promise<GiteaRepo[]> => {
  const account = await accountStore.getActiveAccount();
  if (!account) return [];
  const client = new GiteaClient(account.baseUrl, account.token);
  return client.listRepos();
};

export const listOwnersForActiveAccount = async (): Promise<GiteaOwner[]> => {
  const account = await accountStore.getActiveAccount();
  if (!account) return [];
  const client = new GiteaClient(account.baseUrl, account.token);
  const orgs = await client.listOrgs().catch(() => []);
  return [
    { name: account.login, displayName: account.login, type: "user" as const },
    ...orgs.map((o) => ({
      name: o.username,
      displayName: o.full_name ? `${o.full_name} (${o.username})` : o.username,
      type: "org" as const
    }))
  ];
};

export const createRepoForActiveAccount = async (input: CreateRepoInput): Promise<GiteaRepo> => {
  const account = await accountStore.getActiveAccount();
  if (!account) throw new Error("Not signed in");
  const client = new GiteaClient(account.baseUrl, account.token);
  const owner = input.owner === account.login ? "" : input.owner;
  return client.createRepo({
    owner,
    name: input.name,
    description: input.description,
    private: input.private,
    autoInit: input.autoInit,
    defaultBranch: input.defaultBranch,
    gitignoreTemplate: input.gitignoreTemplate,
    licenseTemplate: input.licenseTemplate
  });
};

export const listBranchesForActiveAccount = async (owner: string, repo: string): Promise<string[]> => {
  const account = await accountStore.getActiveAccount();
  if (!account) return [];
  const client = new GiteaClient(account.baseUrl, account.token);
  return client.listBranches(owner, repo);
};

export const createBranchForActiveAccount = async (input: CreateBranchInput): Promise<void> => {
  const account = await accountStore.getActiveAccount();
  if (!account) throw new Error("Not signed in");
  const client = new GiteaClient(account.baseUrl, account.token);
  await client.createBranch(input);
};

export const getRepoOpenCountsForActiveAccount = async (owner: string, repo: string): Promise<RepoOpenCounts> => {
  const account = await accountStore.getActiveAccount();
  if (!account) return { openIssues: null, openPulls: null };
  const client = new GiteaClient(account.baseUrl, account.token);
  return client.getRepoOpenCounts(owner, repo);
};
