import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  Account,
  CreateBranchInput,
  CreateRepoInput,
  GiteaOwner,
  GiteaRepo,
  GitOperationProgress,
  RepoOpenCounts,
  RepoStatus
} from "../../shared/types";

type View = "login" | "home" | "repos" | "publish" | "settings" | "help";

export const App = () => {
  const api = useMemo(
    () =>
      ((window as unknown as { giteaDesktop?: unknown }).giteaDesktop as typeof window.giteaDesktop | undefined) ??
      undefined,
    []
  );
  const [bridgeMissing, setBridgeMissing] = useState(false);
  const [view, setView] = useState<View>("login");
  const [baseUrl, setBaseUrl] = useState("https://gitea.com");
  const [loginMode, setLoginMode] = useState<"token" | "password" | "oauth">("token");
  const [token, setToken] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [oauthClientId, setOauthClientId] = useState("");
  const [oauthClientIdDraft, setOauthClientIdDraft] = useState("");
  const [oauthClientSecret, setOauthClientSecret] = useState("");
  const [oauthClientSecretDraft, setOauthClientSecretDraft] = useState("");
  const [activeAccount, setActiveAccount] = useState<Account | null>(null);
  const [repos, setRepos] = useState<GiteaRepo[]>([]);
  const [reposLoading, setReposLoading] = useState(false);
  const reposLoadingRef = useRef(false);
  const [reposLoadFailed, setReposLoadFailed] = useState(false);
  const [reposLoadErrorCode, setReposLoadErrorCode] = useState<number | null>(null);
  const [selectedRepo, setSelectedRepo] = useState<GiteaRepo | null>(null);
  const [remoteProtocol, setRemoteProtocol] = useState<"https" | "ssh">("https");
  const [cloneParentPath, setCloneParentPath] = useState<string>("");
  const [cloneFolderName, setCloneFolderName] = useState<string>("");
  const [cloneBranch, setCloneBranch] = useState<string>("");
  const [folderPath, setFolderPath] = useState<string>("");
  const [statusRepoPath, setStatusRepoPath] = useState<string>("");
  const [repoStatus, setRepoStatus] = useState<RepoStatus | null>(null);
  const [devToolsEnabled, setDevToolsEnabled] = useState(false);
  const [loginInProgress, setLoginInProgress] = useState(false);
  const [owners, setOwners] = useState<GiteaOwner[]>([]);
  const [ownersLoading, setOwnersLoading] = useState(false);
  const ownersLoadingRef = useRef(false);
  const [newRepoOwner, setNewRepoOwner] = useState("");
  const [newRepoName, setNewRepoName] = useState("");
  const [newRepoDescription, setNewRepoDescription] = useState("");
  const [newRepoPrivate, setNewRepoPrivate] = useState(false);
  const [newRepoAutoInit, setNewRepoAutoInit] = useState(false);
  const [newRepoDefaultBranch, setNewRepoDefaultBranch] = useState("main");
  const [newRepoGitignoreTemplate, setNewRepoGitignoreTemplate] = useState("");
  const [newRepoLicenseTemplate, setNewRepoLicenseTemplate] = useState("");
  const [createRepoInProgress, setCreateRepoInProgress] = useState(false);
  const [publishCommitTitle, setPublishCommitTitle] = useState("Initial commit");
  const [publishCommitBody, setPublishCommitBody] = useState("");
  const [publishBranch, setPublishBranch] = useState<string>("");
  const [publishInProgress, setPublishInProgress] = useState(false);
  const [publishOpId, setPublishOpId] = useState<string>("");
  const [publishProgress, setPublishProgress] = useState<GitOperationProgress | null>(null);
  const [repoBranches, setRepoBranches] = useState<string[]>([]);
  const [repoBranchesLoading, setRepoBranchesLoading] = useState(false);
  const [repoOpenCounts, setRepoOpenCounts] = useState<RepoOpenCounts | null>(null);
  const [repoOpenCountsLoading, setRepoOpenCountsLoading] = useState(false);
  const [createBranchFrom, setCreateBranchFrom] = useState<string>("");
  const [createBranchName, setCreateBranchName] = useState<string>("");
  const [createBranchInProgress, setCreateBranchInProgress] = useState(false);

  useEffect(() => {
    setBridgeMissing(!api);
  }, [api]);

  const selectedRemoteUrl = useMemo(() => {
    if (!selectedRepo) return "";
    return remoteProtocol === "ssh" ? selectedRepo.sshUrl : selectedRepo.cloneUrl;
  }, [remoteProtocol, selectedRepo]);

  useEffect(() => {
    if (!selectedRepo) return;
    if (!cloneFolderName) setCloneFolderName(selectedRepo.name);
  }, [cloneFolderName, selectedRepo]);

  const logError = useCallback((context: string, e: unknown) => {
    console.error(`[${context}]`, e);
  }, []);

  const withTimeout = useCallback(async <T,>(promise: Promise<T>, ms: number) => {
    return await new Promise<T>((resolve, reject) => {
      const id = setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms);
      promise.then(
        (v) => {
          clearTimeout(id);
          resolve(v);
        },
        (e) => {
          clearTimeout(id);
          reject(e);
        }
      );
    });
  }, []);

  const loadRepos = useCallback(async () => {
    if (!api) return;
    if (!activeAccount) return;
    if (reposLoadingRef.current) return;
    reposLoadingRef.current = true;
    setReposLoading(true);
    try {
      const r = await withTimeout(api.gitea.listRepos(), 20_000);
      setRepos(Array.isArray(r) ? r : []);
      setReposLoadFailed(false);
      setReposLoadErrorCode(null);
    } catch (e) {
      logError("listRepos", e);
      setRepos([]);
      setReposLoadFailed(true);
      const msg = e instanceof Error ? e.message : String(e);
      const m = msg.match(/Gitea API error\s+(\d+)/i);
      setReposLoadErrorCode(m ? Number(m[1]) : null);
    } finally {
      setReposLoading(false);
      reposLoadingRef.current = false;
    }
  }, [activeAccount, api, logError, withTimeout]);

  const loadOwners = useCallback(async () => {
    if (!api) return;
    if (!activeAccount) return;
    if (ownersLoadingRef.current) return;
    ownersLoadingRef.current = true;
    setOwnersLoading(true);
    try {
      const o = await withTimeout(api.gitea.listOwners(), 20_000);
      setOwners(Array.isArray(o) ? o : []);
      if (!newRepoOwner) {
        setNewRepoOwner(activeAccount.login);
      }
    } catch (e) {
      logError("listOwners", e);
      setOwners([]);
    } finally {
      setOwnersLoading(false);
      ownersLoadingRef.current = false;
    }
  }, [activeAccount, api, logError, newRepoOwner, withTimeout]);

  const loadSelectedRepoMeta = useCallback(
    async (repo: GiteaRepo) => {
      if (!api) return;
      if (!activeAccount) return;
      const owner = repo.owner;
      const name = repo.name;
      setRepoBranchesLoading(true);
      setRepoOpenCountsLoading(true);
      try {
        const [branches, counts] = await Promise.all([
          withTimeout(api.gitea.listBranches(owner, name), 20_000).catch((e) => {
            logError("listBranches", e);
            return [] as string[];
          }),
          withTimeout(api.gitea.getRepoOpenCounts(owner, name), 20_000).catch((e) => {
            logError("getRepoOpenCounts", e);
            return { openIssues: null, openPulls: null } as RepoOpenCounts;
          })
        ]);
        setRepoBranches(Array.isArray(branches) ? branches : []);
        setRepoOpenCounts(counts ?? { openIssues: null, openPulls: null });
        setCreateBranchFrom((prev) => prev || repo.defaultBranch || "main");
      } finally {
        setRepoBranchesLoading(false);
        setRepoOpenCountsLoading(false);
      }
    },
    [activeAccount, api, logError, withTimeout]
  );

  useEffect(() => {
    if (!api) return;
    api.auth
      .getActiveAccount()
      .then((acct) => {
        setActiveAccount(acct);
        setView(acct ? "home" : "login");
      })
      .catch((e) => logError("getActiveAccount", e));
  }, [api, logError]);

  useEffect(() => {
    if (!api) return;
    if (!activeAccount) return;
    if (view !== "home" && view !== "repos" && view !== "publish") return;
    void loadRepos();
  }, [activeAccount, api, loadRepos, view]);

  useEffect(() => {
    if (!selectedRepo) {
      setRepoBranches([]);
      setRepoOpenCounts(null);
      setCloneBranch("");
      setPublishBranch("");
      setCreateBranchFrom("");
      setCreateBranchName("");
      return;
    }
    setCloneBranch(selectedRepo.defaultBranch || "main");
    setPublishBranch(selectedRepo.defaultBranch || "main");
    setCreateBranchFrom(selectedRepo.defaultBranch || "main");
    void loadSelectedRepoMeta(selectedRepo);
  }, [loadSelectedRepoMeta, selectedRepo]);

  useEffect(() => {
    if (!api) return;
    if (!activeAccount) return;
    void loadOwners();
  }, [activeAccount, api, loadOwners]);

  useEffect(() => {
    if (!api) return;
    const fn = (api.git as unknown as { onOperationProgress?: (listener: (p: GitOperationProgress) => void) => () => void })
      .onOperationProgress;
    if (typeof fn !== "function") return;
    const unsubscribe = fn((p) => {
      if (!p.opId) return;
      if (publishOpId && p.opId !== publishOpId) return;
      setPublishProgress(p);
      if (p.phase === "done" || p.phase === "error") {
        setPublishInProgress(false);
      }
    });
    return () => unsubscribe();
  }, [api, publishOpId]);

  useEffect(() => {
    if (!api) return;
    if (!statusRepoPath) return;
    let cancelled = false;
    const unsubscribe = api.git.onStatusChanged(({ repoPath, status }) => {
      if (repoPath !== statusRepoPath) return;
      setRepoStatus(status);
    });

    api.git
      .getStatus(statusRepoPath)
      .then((s) => {
        if (!cancelled) setRepoStatus(s);
      })
      .catch((e) => {
        logError("getStatus", e);
      });

    api.git.watchStatus(statusRepoPath).catch((e) => {
      logError("watchStatus", e);
    });

    return () => {
      cancelled = true;
      unsubscribe();
      api.git.unwatchStatus(statusRepoPath).catch(() => undefined);
    };
  }, [api, logError, statusRepoPath]);

  useEffect(() => {
    if (!api) return;
    api.settings
      .get()
      .then((s) => {
        setDevToolsEnabled(Boolean(s.devToolsEnabled));
        setOauthClientId(String(s.oauthClientId || ""));
        setOauthClientIdDraft(String(s.oauthClientId || ""));
        setOauthClientSecret(String(s.oauthClientSecret || ""));
        setOauthClientSecretDraft(String(s.oauthClientSecret || ""));
      })
      .catch((e) => logError("getSettings", e));
  }, [api, logError]);

  const onToggleDevTools = async (enabled: boolean) => {
    if (!api) return;
    try {
      const s = await api.settings.setDevToolsEnabled(enabled);
      setDevToolsEnabled(Boolean(s.devToolsEnabled));
    } catch (e) {
      logError("setDevToolsEnabled", e);
    }
  };

  const onLogin = async () => {
    if (!api) return;
    setLoginInProgress(true);
    try {
      const trimmedOauthClientId = oauthClientId.trim();
      if (loginMode === "oauth" && trimmedOauthClientId && trimmedOauthClientId !== oauthClientIdDraft.trim()) {
        const s = await api.settings.setOauthClientId(trimmedOauthClientId);
        setOauthClientId(String(s.oauthClientId || ""));
        setOauthClientIdDraft(String(s.oauthClientId || ""));
      }
      const trimmedOauthClientSecret = oauthClientSecret;
      if (loginMode === "oauth" && trimmedOauthClientSecret !== oauthClientSecretDraft) {
        const s = await api.settings.setOauthClientSecret(trimmedOauthClientSecret);
        setOauthClientSecret(String(s.oauthClientSecret || ""));
        setOauthClientSecretDraft(String(s.oauthClientSecret || ""));
      }
      const account =
        loginMode === "oauth"
          ? await api.auth.loginWithOAuth(baseUrl, trimmedOauthClientId, oauthClientSecret.trim() || undefined)
          : loginMode === "password"
            ? await api.auth.loginWithPassword(baseUrl, username.trim(), password)
            : await api.auth.loginWithToken(baseUrl, token.trim());
      setActiveAccount(account);
      setToken("");
      setUsername("");
      setPassword("");
      setView("home");
      setRepos([]);
      void loadRepos();
    } catch (e) {
      logError("login", e);
    } finally {
      setLoginInProgress(false);
    }
  };

  const onSaveOauthClientId = async () => {
    if (!api) return;
    try {
      const s = await api.settings.setOauthClientId(oauthClientIdDraft.trim());
      setOauthClientId(String(s.oauthClientId || ""));
      setOauthClientIdDraft(String(s.oauthClientId || ""));
    } catch (e) {
      logError("setOauthClientId", e);
    }
  };

  const onSaveOauthClientSecret = async () => {
    if (!api) return;
    try {
      const s = await api.settings.setOauthClientSecret(oauthClientSecretDraft);
      setOauthClientSecret(String(s.oauthClientSecret || ""));
      setOauthClientSecretDraft(String(s.oauthClientSecret || ""));
    } catch (e) {
      logError("setOauthClientSecret", e);
    }
  };

  const onLogout = async () => {
    if (!api) return;
    if (!activeAccount) return;
    try {
      await api.auth.logout(activeAccount.id);
      setActiveAccount(null);
      setRepos([]);
      setSelectedRepo(null);
      setRemoteProtocol("https");
      setCloneParentPath("");
      setCloneFolderName("");
      setView("login");
    } catch (e) {
      logError("logout", e);
    }
  };

  const onChooseFolder = async () => {
    if (!api) return;
    try {
      const p = await api.git.chooseFolder();
      if (p) setFolderPath(p);
    } catch (e) {
      logError("chooseFolder", e);
    }
  };

  const onChooseCloneParent = async () => {
    if (!api) return;
    try {
      const p = await api.git.chooseFolder();
      if (p) setCloneParentPath(p);
    } catch (e) {
      logError("chooseCloneParent", e);
    }
  };

  const onCloneSelected = async () => {
    if (!api) return;
    if (!selectedRepo || !cloneParentPath || !cloneFolderName.trim()) return;
    try {
      const res = await api.git.cloneRepo({
        remoteUrl: selectedRemoteUrl,
        parentPath: cloneParentPath,
        folderName: cloneFolderName.trim(),
        branch: cloneBranch.trim() || undefined
      });
      setStatusRepoPath(res.repoPath);
      setView("repos");
    } catch (e) {
      logError("cloneRepo", e);
    }
  };

  const onCreateRepo = async () => {
    if (!api) return;
    if (!activeAccount) return;
    if (!newRepoOwner.trim() || !newRepoName.trim()) return;
    setCreateRepoInProgress(true);
    try {
      const input: CreateRepoInput = {
        owner: newRepoOwner.trim(),
        name: newRepoName.trim(),
        description: newRepoDescription.trim() || undefined,
        private: Boolean(newRepoPrivate),
        autoInit: Boolean(newRepoAutoInit),
        defaultBranch: newRepoDefaultBranch.trim() || undefined,
        gitignoreTemplate: newRepoGitignoreTemplate.trim() || undefined,
        licenseTemplate: newRepoLicenseTemplate.trim() || undefined
      };
      const created = await api.gitea.createRepo(input);
      setSelectedRepo(created);
      setRemoteProtocol("https");
      setNewRepoName("");
      setNewRepoDescription("");
      await loadRepos();
    } catch (e) {
      logError("createRepo", e);
    } finally {
      setCreateRepoInProgress(false);
    }
  };

  const onPublish = async () => {
    if (!api) return;
    if (!folderPath || !selectedRemoteUrl) return;
    try {
      const opId = (globalThis.crypto && "randomUUID" in globalThis.crypto ? globalThis.crypto.randomUUID() : `${Date.now()}`);
      setPublishOpId(opId);
      setPublishInProgress(true);
      setPublishProgress({ opId, phase: "prepare", message: "Starting publish…" });
      const title = publishCommitTitle.trim() || "Initial commit";
      const body = publishCommitBody.trim();
      const initialCommitMessage = body ? `${title}\n\n${body}` : title;
      const branch = publishBranch.trim() || selectedRepo?.defaultBranch || "main";
      await api.git.publishFolder({
        folderPath,
        remoteUrl: selectedRemoteUrl,
        branch,
        initialCommitMessage,
        opId
      });
      setStatusRepoPath(folderPath);
      setView("repos");
    } catch (e) {
      logError("publishFolder", e);
      setPublishInProgress(false);
    }
  };

  const onRefreshStatus = async () => {
    if (!api) return;
    if (!statusRepoPath) return;
    try {
      const s = await api.git.getStatus(statusRepoPath);
      setRepoStatus(s);
    } catch (e) {
      logError("refreshStatus", e);
    }
  };

  const onCreateBranch = async () => {
    if (!api) return;
    if (!selectedRepo) return;
    const owner = selectedRepo.owner;
    const repo = selectedRepo.name;
    const fromBranch = createBranchFrom.trim() || selectedRepo.defaultBranch || "main";
    const newBranch = createBranchName.trim();
    if (!newBranch) return;
    setCreateBranchInProgress(true);
    try {
      const input: CreateBranchInput = { owner, repo, fromBranch, newBranch };
      await api.gitea.createBranch(input);
      setCreateBranchName("");
      await loadSelectedRepoMeta(selectedRepo);
      setCloneBranch(newBranch);
      setPublishBranch(newBranch);
    } catch (e) {
      logError("createBranch", e);
    } finally {
      setCreateBranchInProgress(false);
    }
  };

  const groupedRepos = useMemo(() => {
    const byOwner = new Map<string, GiteaRepo[]>();
    for (const r of repos) {
      const key = r.owner || "(unknown)";
      const existing = byOwner.get(key);
      if (existing) existing.push(r);
      else byOwner.set(key, [r]);
    }
    const ownersSorted = Array.from(byOwner.keys()).sort((a, b) => a.localeCompare(b));
    return ownersSorted.map((owner) => {
      const list = byOwner.get(owner) ?? [];
      list.sort((a, b) => a.fullName.localeCompare(b.fullName));
      return { owner, repos: list };
    });
  }, [repos]);

  const viewTitle = useMemo(() => {
    switch (view) {
      case "login":
        return "Sign in";
      case "home":
        return "Home";
      case "repos":
        return "Repositories";
      case "publish":
        return "Publish";
      case "settings":
        return "Settings";
      case "help":
        return "Help";
      default:
        return "Gitea Desktop";
    }
  }, [view]);

  return (
    <div className="app">
      <div className="shell">
        <aside className="sidebar">
          <div className="brand">Gitea Desktop</div>

          <div className="nav">
            {activeAccount ? (
              <>
                <button className={`navBtn ${view === "home" ? "navBtnActive" : ""}`} onClick={() => setView("home")}>
                  <span>Home</span>
                </button>
                <button className={`navBtn ${view === "repos" ? "navBtnActive" : ""}`} onClick={() => setView("repos")}>
                  <span>Repositories</span>
                  <span className="navMeta">{reposLoading ? "…" : String(repos.length)}</span>
                </button>
                <button
                  className={`navBtn ${view === "publish" ? "navBtnActive" : ""}`}
                  onClick={() => setView("publish")}
                >
                  <span>Publish</span>
                  <span className="navMeta">{reposLoading ? "…" : String(repos.length)}</span>
                </button>
              </>
            ) : (
              <button className={`navBtn ${view === "login" ? "navBtnActive" : ""}`} onClick={() => setView("login")}>
                <span>Sign in</span>
              </button>
            )}
            <button className={`navBtn ${view === "settings" ? "navBtnActive" : ""}`} onClick={() => setView("settings")}>
              <span>Settings</span>
            </button>
            <button className={`navBtn ${view === "help" ? "navBtnActive" : ""}`} onClick={() => setView("help")}>
              <span>Help</span>
            </button>
          </div>

          <div className="sidebarFooter">
            {activeAccount ? (
              <>
                <div className="pill" title={activeAccount.baseUrl}>
                  {activeAccount.displayName}
                </div>
                <button className="btn" onClick={onLogout}>
                  Log out
                </button>
              </>
            ) : (
              <div className="muted">Not signed in</div>
            )}
          </div>
        </aside>

        <main className="main">
          <div className="topbar">
            <div className="topbarTitle">{viewTitle}</div>
            {activeAccount ? (
              <div className="row">
                <div className="pill" title={activeAccount.baseUrl}>
                  <span className="code">{activeAccount.baseUrl}</span>
                </div>
                <div className="pill">{reposLoading ? "Loading…" : `${repos.length} repos`}</div>
                {reposLoadFailed ? (
                  <div className="pill">
                    Repo load failed{reposLoadErrorCode ? ` (${reposLoadErrorCode})` : ""} (see console)
                  </div>
                ) : null}
                {view === "home" || view === "repos" || view === "publish" ? (
                  <button className="btn" onClick={() => void loadRepos()} disabled={bridgeMissing || reposLoading}>
                    Refresh
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>

          {bridgeMissing ? (
            <div className="warn">
              Desktop bridge is not available (preload did not load). In dev, ensure `electron/preload.cjs` exists and restart
              `npm run dev`.
            </div>
          ) : null}

      {view === "login" ? (
        <div className="panel grid" style={{ maxWidth: 720 }}>
          <div className="title">Sign in</div>
          <div className="muted">Connect to your Gitea instance and pick repositories to clone or publish.</div>

          <div className="field">
            <div className="label">Instance URL</div>
            <input
              className="input"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://gitea.example.com"
            />
          </div>

          <div className="row">
            <label className="pill" style={{ cursor: "pointer" }}>
              <input type="radio" checked={loginMode === "token"} onChange={() => setLoginMode("token")} />
              Token
            </label>
            <label className="pill" style={{ cursor: "pointer" }}>
              <input type="radio" checked={loginMode === "password"} onChange={() => setLoginMode("password")} />
              Username + Password
            </label>
            <label className="pill" style={{ cursor: "pointer" }}>
              <input type="radio" checked={loginMode === "oauth"} onChange={() => setLoginMode("oauth")} />
              Browser (OAuth)
            </label>
          </div>

          {loginMode === "token" ? (
            <div className="field">
              <div className="label">Personal access token</div>
              <input
                className="input"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="token"
                type="password"
              />
              <div className="muted">
                Create a token in Gitea: Settings → Applications → Manage Access Tokens.
              </div>
            </div>
          ) : loginMode === "password" ? (
            <div className="twoCol">
              <div className="field">
                <div className="label">Username</div>
                <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} />
              </div>
              <div className="field">
                <div className="label">Password</div>
                <input className="input" value={password} onChange={(e) => setPassword(e.target.value)} type="password" />
              </div>
              <div className="muted" style={{ gridColumn: "1 / -1" }}>
                This creates a new access token and stores only that token (not your password). Accounts with 2FA may require token login.
              </div>
            </div>
          ) : (
            <div className="grid">
              <div className="muted">
                This opens your browser for sign-in and consent, then returns to the app.
              </div>
              <div className="field">
                <div className="label">OAuth client ID</div>
                <input
                  className="input"
                  value={oauthClientId}
                  onChange={(e) => setOauthClientId(e.target.value)}
                  placeholder="Paste OAuth client ID"
                />
                <div className="muted">
                  Create an OAuth2 app in Gitea: Settings → Applications → OAuth2 Applications. Redirect URL must be{" "}
                  <span className="code">http://127.0.0.1:17171/oauth/callback</span>
                </div>
              </div>
              <div className="field">
                <div className="label">OAuth client secret</div>
                <input
                  className="input"
                  value={oauthClientSecret}
                  onChange={(e) => setOauthClientSecret(e.target.value)}
                  placeholder="Client secret from Gitea OAuth app"
                  type="password"
                />
              </div>
            </div>
          )}

          <div className="row">
            <button
              className="btn btnPrimary"
              onClick={onLogin}
              disabled={
                !baseUrl.trim() ||
                (loginMode === "token"
                  ? !token.trim()
                  : loginMode === "password"
                    ? !username.trim() || !password.trim()
                    : !oauthClientId.trim() || !oauthClientSecret.trim()) ||
                loginInProgress ||
                bridgeMissing
              }
            >
              {loginMode === "oauth" ? "Open browser to sign in" : "Log in"}
            </button>
          </div>
        </div>
      ) : null}

      {view === "home" ? (
        <div className="grid">
          <div className="hero">
            <div className="heroTitle">Welcome back{activeAccount ? `, ${activeAccount.displayName}` : ""}.</div>
            <div className="heroSub">
              Connected to <span className="code">{activeAccount?.baseUrl}</span>
            </div>
            <div className="row">
              <button className="btn btnPrimary" onClick={() => setView("repos")} disabled={bridgeMissing}>
                Browse repositories
              </button>
              <button className="btn" onClick={() => setView("publish")} disabled={bridgeMissing}>
                Publish a folder
              </button>
              <button className="btn" onClick={() => setView("settings")}>
                Settings
              </button>
              <button className="btn" onClick={() => void loadRepos()} disabled={bridgeMissing || reposLoading}>
                Refresh repos
              </button>
            </div>
          </div>

          <div className="cardGrid">
            <div className="panel grid">
              <div className="title">Status</div>
              <div className="muted">Account</div>
              <div className="row">
                <span className="pill">Signed in</span>
                <span className="pill">{activeAccount?.login}</span>
              </div>
              <div className="muted">Repositories</div>
              <div className="row">
                <span className="pill">{reposLoading ? "Loading…" : `${repos.length} found`}</span>
                {selectedRepo ? <span className="pill">Selected: {selectedRepo.fullName}</span> : null}
              </div>
            </div>

            <div className="panel grid">
              <div className="title">Quick clone</div>
              <div className="muted">Pick a repo below, then clone it in the Repos tab.</div>
              <div className="repoGrid">
                {repos.slice(0, 6).map((r) => (
                  <button
                    key={r.id}
                    onClick={() => {
                      setSelectedRepo(r);
                      setView("repos");
                    }}
                    className="repoCard"
                    disabled={bridgeMissing}
                  >
                    <div style={{ fontWeight: 800 }}>{r.fullName}</div>
                    <div className="muted">{r.private ? "Private" : "Public"}</div>
                  </button>
                ))}
              </div>
              {repos.length === 0 && !reposLoading ? <div className="muted">No repositories loaded yet.</div> : null}
            </div>
          </div>
        </div>
      ) : null}

      {view === "repos" ? (
        <div className="grid">
          <div className="panel grid">
            <div className="title">Your repositories</div>
            {reposLoading && repos.length === 0 ? <div className="muted">Loading…</div> : null}
            <div className="repoGroupList">
              {groupedRepos.map((g) => (
                <div key={g.owner} className="repoGroup">
                  <div className="repoGroupHeader">
                    <div className="repoGroupName">{g.owner}</div>
                    <div className="repoGroupLine" />
                  </div>
                  <div className="repoGrid">
                    {g.repos.map((r) => (
                      <button
                        key={r.id}
                        onClick={() => setSelectedRepo(r)}
                        className={`repoCard ${selectedRepo?.id === r.id ? "repoCardSelected" : ""}`}
                      >
                        <div style={{ fontWeight: 800 }}>{r.fullName}</div>
                        <div className="muted">{r.private ? "Private" : "Public"}</div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {!reposLoading && repos.length === 0 ? (
              <div className="muted">
                {reposLoadErrorCode === 401
                  ? "Repo listing is unauthorized. Create a token with repository permissions (repo/read:repository) and sign in again."
                  : "No repositories loaded yet."}
              </div>
            ) : null}
          </div>

          <div className="panel grid" style={{ maxWidth: 860 }}>
            <div className="title">Clone selected repository</div>
            <div className="row">
              <label className="pill" style={{ cursor: "pointer" }}>
                <input
                  type="radio"
                  checked={remoteProtocol === "https"}
                  onChange={() => setRemoteProtocol("https")}
                />
                HTTPS
              </label>
              <label className="pill" style={{ cursor: "pointer" }}>
                <input type="radio" checked={remoteProtocol === "ssh"} onChange={() => setRemoteProtocol("ssh")} />
                SSH
              </label>
              <div className="pill" style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                {selectedRemoteUrl ? <span className="code">{selectedRemoteUrl}</span> : "Select a repository first"}
              </div>
            </div>

            <div className="field">
              <div className="label">Branch</div>
              <input
                className="input"
                list="branchOptionsClone"
                value={cloneBranch}
                onChange={(e) => setCloneBranch(e.target.value)}
                placeholder={selectedRepo?.defaultBranch || "main"}
                disabled={bridgeMissing || !selectedRepo}
              />
              <datalist id="branchOptionsClone">
                {(repoBranches || []).map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
              <div className="row">
                <span className="pill">{repoBranchesLoading ? "Loading branches…" : `${repoBranches.length} branches`}</span>
                {repoOpenCountsLoading ? <span className="pill">Loading issues/PRs…</span> : null}
                {repoOpenCounts && !repoOpenCountsLoading ? (
                  <>
                    <span className="pill">
                      Issues: {repoOpenCounts.openIssues === null ? "?" : String(repoOpenCounts.openIssues)}
                    </span>
                    <span className="pill">PRs: {repoOpenCounts.openPulls === null ? "?" : String(repoOpenCounts.openPulls)}</span>
                  </>
                ) : null}
              </div>
            </div>

            <div className="field">
              <div className="label">Destination folder</div>
              <div className="row">
                <input
                  className="input"
                  style={{ flex: 1 }}
                  value={cloneParentPath}
                  onChange={(e) => setCloneParentPath(e.target.value)}
                  placeholder="C:\\path\\to\\parent"
                />
                <button className="btn" onClick={onChooseCloneParent}>
                  Choose…
                </button>
              </div>
            </div>

            <div className="field">
              <div className="label">New folder name</div>
              <input className="input" value={cloneFolderName} onChange={(e) => setCloneFolderName(e.target.value)} />
            </div>

            <button
              className="btn btnPrimary"
              onClick={onCloneSelected}
              disabled={!selectedRepo || !cloneParentPath || !cloneFolderName.trim() || bridgeMissing}
            >
              Clone
            </button>
            <div className="muted">
              For HTTPS clones on the same instance, the saved token is used for authentication. For SSH, your SSH keys must
              already be configured on your machine.
            </div>
          </div>

          {selectedRepo ? (
            <div className="panel grid" style={{ maxWidth: 860 }}>
              <div className="title">Branch tools</div>
              <div className="twoCol">
                <div className="field">
                  <div className="label">Base branch</div>
                  <select
                    className="select"
                    value={createBranchFrom}
                    onChange={(e) => setCreateBranchFrom(e.target.value)}
                    disabled={bridgeMissing || !selectedRepo}
                  >
                    {(repoBranches.length ? repoBranches : [selectedRepo.defaultBranch || "main"]).map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <div className="label">New branch name</div>
                  <input
                    className="input"
                    value={createBranchName}
                    onChange={(e) => setCreateBranchName(e.target.value)}
                    placeholder="feature/my-branch"
                    disabled={bridgeMissing || !selectedRepo || createBranchInProgress}
                  />
                </div>
              </div>
              <button
                className="btn"
                onClick={() => void onCreateBranch()}
                disabled={bridgeMissing || !selectedRepo || !createBranchName.trim() || createBranchInProgress}
              >
                {createBranchInProgress ? "Creating…" : "Create branch"}
              </button>
            </div>
          ) : null}

          <div className="panel grid" style={{ maxWidth: 860 }}>
            <div className="title">Local status</div>
            <div className="muted">Optional: enter a local repo path to watch changes.</div>
            <div className="row">
              <input
                className="input"
                style={{ flex: 1 }}
                value={statusRepoPath}
                onChange={(e) => setStatusRepoPath(e.target.value)}
                placeholder="C:\\path\\to\\repo"
              />
              <button className="btn" onClick={onRefreshStatus} disabled={!statusRepoPath || bridgeMissing}>
                Refresh
              </button>
            </div>
            {repoStatus ? (
              <div className="panel grid" style={{ background: "rgba(0,0,0,0.18)" }}>
                <div>Branch: {repoStatus.branch ?? "(detached)"}</div>
                <div>Changes: {repoStatus.changed.length}</div>
                {repoStatus.changed.slice(0, 12).map((c) => (
                  <div key={c.path}>
                    {c.indexStatus}
                    {c.worktreeStatus} {c.path}
                  </div>
                ))}
                {repoStatus.changed.length > 12 ? <div>…</div> : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {view === "publish" ? (
        <div className="panel grid" style={{ maxWidth: 860 }}>
          <div className="title">Publish folder to repository</div>
          <div className="muted">Push any local folder to a selected Gitea repo.</div>

          <div className="field">
            <div className="label">Local folder</div>
            <div className="row">
              <input className="input" style={{ flex: 1 }} value={folderPath} onChange={(e) => setFolderPath(e.target.value)} />
              <button className="btn" onClick={onChooseFolder} disabled={bridgeMissing}>
                Choose…
              </button>
            </div>
            <div className="muted">If the folder is not a Git repo, it will be initialized and pushed.</div>
          </div>

          <div className="title" style={{ fontSize: 14 }}>
            Create repository
          </div>
          <div className="muted">Create a new repository on the server, then select it below.</div>
          <div className="twoCol">
            <div className="field">
              <div className="label">Owner</div>
              <select
                className="select"
                value={newRepoOwner}
                onChange={(e) => setNewRepoOwner(e.target.value)}
                disabled={bridgeMissing || ownersLoading || !activeAccount}
              >
                {owners.length === 0 && activeAccount ? (
                  <option value={activeAccount.login}>{activeAccount.login}</option>
                ) : (
                  owners.map((o) => (
                    <option key={`${o.type}:${o.name}`} value={o.name}>
                      {o.displayName}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div className="field">
              <div className="label">Visibility</div>
              <div className="row">
                <label className="pill" style={{ cursor: "pointer" }}>
                  <input type="radio" checked={!newRepoPrivate} onChange={() => setNewRepoPrivate(false)} />
                  Public
                </label>
                <label className="pill" style={{ cursor: "pointer" }}>
                  <input type="radio" checked={newRepoPrivate} onChange={() => setNewRepoPrivate(true)} />
                  Private
                </label>
              </div>
            </div>
          </div>

          <div className="twoCol">
            <div className="field">
              <div className="label">Repository name</div>
              <input
                className="input"
                value={newRepoName}
                onChange={(e) => setNewRepoName(e.target.value)}
                placeholder="my-new-repo"
                disabled={bridgeMissing || createRepoInProgress}
              />
            </div>
            <div className="field">
              <div className="label">Description</div>
              <input
                className="input"
                value={newRepoDescription}
                onChange={(e) => setNewRepoDescription(e.target.value)}
                placeholder="Optional"
                disabled={bridgeMissing || createRepoInProgress}
              />
            </div>
          </div>

          <div className="twoCol">
            <div className="field">
              <div className="label">Default branch</div>
              <input
                className="input"
                value={newRepoDefaultBranch}
                onChange={(e) => setNewRepoDefaultBranch(e.target.value)}
                placeholder="main"
                disabled={bridgeMissing || createRepoInProgress}
              />
              <label className="row" style={{ cursor: "pointer", marginTop: 6 }}>
                <input
                  type="checkbox"
                  checked={newRepoAutoInit}
                  onChange={(e) => setNewRepoAutoInit(e.target.checked)}
                  disabled={bridgeMissing || createRepoInProgress}
                />
                Initialize repository
              </label>
            </div>
            <div className="field">
              <div className="label">Templates (optional)</div>
              <input
                className="input"
                value={newRepoGitignoreTemplate}
                onChange={(e) => setNewRepoGitignoreTemplate(e.target.value)}
                placeholder=".gitignore template (e.g. Node)"
                disabled={bridgeMissing || createRepoInProgress}
              />
              <input
                className="input"
                value={newRepoLicenseTemplate}
                onChange={(e) => setNewRepoLicenseTemplate(e.target.value)}
                placeholder="License template (e.g. MIT)"
                disabled={bridgeMissing || createRepoInProgress}
              />
            </div>
          </div>

          <div className="row">
            <button
              className="btn"
              onClick={onCreateRepo}
              disabled={bridgeMissing || createRepoInProgress || !activeAccount || !newRepoOwner.trim() || !newRepoName.trim()}
            >
              {createRepoInProgress ? "Creating…" : "Create repository"}
            </button>
            <button className="btn" onClick={() => void loadOwners()} disabled={bridgeMissing || ownersLoading || !activeAccount}>
              {ownersLoading ? "Refreshing…" : "Refresh owners"}
            </button>
          </div>

          <div className="field">
            <div className="label">Remote repo</div>
            <div className="row">
              <label className="pill" style={{ cursor: "pointer" }}>
                <input
                  type="radio"
                  checked={remoteProtocol === "https"}
                  onChange={() => setRemoteProtocol("https")}
                />
                HTTPS
              </label>
              <label className="pill" style={{ cursor: "pointer" }}>
                <input type="radio" checked={remoteProtocol === "ssh"} onChange={() => setRemoteProtocol("ssh")} />
                SSH
              </label>
            </div>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div className="muted">{reposLoading ? "Loading repositories…" : ""}</div>
              <button className="btn" onClick={() => void loadRepos()} disabled={bridgeMissing || reposLoading}>
                Refresh
              </button>
            </div>
            <select
              className="select"
              value={selectedRepo?.id ?? ""}
              onChange={(e) => setSelectedRepo(repos.find((r) => r.id === e.target.value) ?? null)}
            >
              <option value="">Select a repository…</option>
              {groupedRepos.map((g) => (
                <optgroup key={g.owner} label={g.owner}>
                  {g.repos.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.fullName}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <div className="muted">{selectedRemoteUrl ? <span className="code">{selectedRemoteUrl}</span> : null}</div>
          </div>

          <div className="field">
            <div className="label">Branch</div>
            <input
              className="input"
              list="branchOptionsPublish"
              value={publishBranch}
              onChange={(e) => setPublishBranch(e.target.value)}
              placeholder={selectedRepo?.defaultBranch || "main"}
              disabled={bridgeMissing || publishInProgress || !selectedRepo}
            />
            <datalist id="branchOptionsPublish">
              {(repoBranches || []).map((b) => (
                <option key={b} value={b} />
              ))}
            </datalist>
          </div>

          <div className="field">
            <div className="label">Commit message</div>
            <input
              className="input"
              value={publishCommitTitle}
              onChange={(e) => setPublishCommitTitle(e.target.value)}
              placeholder="Commit title"
              disabled={bridgeMissing || publishInProgress}
            />
            <textarea
              className="input"
              value={publishCommitBody}
              onChange={(e) => setPublishCommitBody(e.target.value)}
              placeholder="Optional description"
              disabled={bridgeMissing || publishInProgress}
              rows={4}
            />
          </div>

          {publishProgress ? (
            <div className="panel grid" style={{ background: "rgba(0,0,0,0.18)" }}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <div>{publishProgress.message}</div>
                {typeof publishProgress.fileCount === "number" ? (
                  <div className="pill">{publishProgress.fileCount} files</div>
                ) : null}
              </div>
              <div className="progressTrack">
                <div
                  className="progressFill"
                  style={{
                    width:
                      publishProgress.phase === "prepare"
                        ? "14%"
                        : publishProgress.phase === "remote"
                          ? "28%"
                          : publishProgress.phase === "stage"
                            ? "44%"
                            : publishProgress.phase === "commit"
                              ? "62%"
                              : publishProgress.phase === "push"
                                ? "86%"
                                : publishProgress.phase === "done"
                                  ? "100%"
                                  : "100%"
                  }}
                />
              </div>
            </div>
          ) : null}

          <button
            className="btn btnPrimary"
            onClick={onPublish}
            disabled={!folderPath || !selectedRepo || bridgeMissing || publishInProgress}
          >
            {publishInProgress ? "Publishing…" : "Publish"}
          </button>

          <div className="muted">
            If you publish via HTTPS and the repo is on the same Gitea instance you logged into, the saved token is used for
            pushing. If you publish via SSH, your SSH agent/keys must already be set up on your machine.
          </div>
        </div>
      ) : null}

      {view === "settings" ? (
        <div className="panel grid" style={{ maxWidth: 860 }}>
          <div className="title">Settings</div>
          <label className="row" style={{ cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={devToolsEnabled}
              onChange={(e) => void onToggleDevTools(e.target.checked)}
              disabled={bridgeMissing}
            />
            Enable developer console
          </label>
          <div className="muted">
            When enabled, DevTools opens automatically. Disable it to run like a normal desktop app.
          </div>

          <div className="title" style={{ fontSize: 14 }}>
            Browser login (OAuth)
          </div>
          <div className="field">
            <div className="label">OAuth client ID</div>
            <input
              className="input"
              value={oauthClientIdDraft}
              onChange={(e) => setOauthClientIdDraft(e.target.value)}
              placeholder="Client ID from Gitea OAuth2 application"
              disabled={bridgeMissing}
            />
            <div className="muted">
              In your Gitea instance: Settings → Applications → OAuth2 Applications. Redirect URL must be{" "}
              <span className="code">http://127.0.0.1:17171/oauth/callback</span>
            </div>
            <div className="row">
              <button
                className="btn"
                onClick={() => setOauthClientIdDraft(oauthClientId)}
                disabled={bridgeMissing || oauthClientIdDraft === oauthClientId}
              >
                Reset
              </button>
              <button
                className="btn btnPrimary"
                onClick={() => void onSaveOauthClientId()}
                disabled={bridgeMissing || oauthClientIdDraft.trim() === oauthClientId.trim()}
              >
                Save
              </button>
            </div>
          </div>

          <div className="field">
            <div className="label">OAuth client secret</div>
            <input
              className="input"
              value={oauthClientSecretDraft}
              onChange={(e) => setOauthClientSecretDraft(e.target.value)}
              placeholder="Client secret from Gitea OAuth app"
              disabled={bridgeMissing}
              type="password"
            />
            <div className="row">
              <button
                className="btn"
                onClick={() => setOauthClientSecretDraft(oauthClientSecret)}
                disabled={bridgeMissing || oauthClientSecretDraft === oauthClientSecret}
              >
                Reset
              </button>
              <button
                className="btn btnPrimary"
                onClick={() => void onSaveOauthClientSecret()}
                disabled={bridgeMissing || oauthClientSecretDraft === oauthClientSecret}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {view === "help" ? (
        <div className="panel grid" style={{ maxWidth: 960 }}>
          <div className="title">Help</div>
          <div className="grid">
            <div className="title" style={{ fontSize: 14 }}>
              Login
            </div>
            <div className="muted">
              Token: create a personal access token in your Gitea instance: Settings → Applications → Manage Access Tokens,
              then paste it into the Login screen. Username + password: the app creates a new access token and stores only
              that token (not your password). Browser (OAuth): register an OAuth2 application and use the client ID.
              Accounts with 2FA often work best with token or OAuth.
            </div>
          </div>
          <div className="grid">
            <div className="title" style={{ fontSize: 14 }}>
              Clone
            </div>
            <div className="muted">
              Select a repo, choose HTTPS or SSH, pick a destination folder, then Clone. For HTTPS clones on the same host as
              the logged-in instance, the saved token is used automatically. For SSH, configure your SSH keys/agent in
              advance.
            </div>
          </div>
          <div className="grid">
            <div className="title" style={{ fontSize: 14 }}>
              Publish Folder
            </div>
            <div className="muted">
              Pick any local folder and a repo. If the folder is not already a Git repo, it will be initialized, committed,
              and pushed to the selected remote.
            </div>
          </div>
          <div className="grid">
            <div className="title" style={{ fontSize: 14 }}>
              Change Detection
            </div>
            <div className="muted">
              When you enter a local repo path in Repos → Local status, the app watches the folder and updates status
              automatically.
            </div>
          </div>
        </div>
      ) : null}
        </main>
      </div>
    </div>
  );
};
