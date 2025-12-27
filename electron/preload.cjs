const { contextBridge, ipcRenderer } = require("electron");

const api = {
  auth: {
    getAccounts: () => ipcRenderer.invoke("auth:getAccounts"),
    setActiveAccount: (accountId) => ipcRenderer.invoke("auth:setActiveAccount", accountId),
    getActiveAccount: () => ipcRenderer.invoke("auth:getActiveAccount"),
    loginWithToken: (baseUrl, token) => ipcRenderer.invoke("auth:loginWithToken", { baseUrl, token }),
    loginWithPassword: (baseUrl, username, password) =>
      ipcRenderer.invoke("auth:loginWithPassword", { baseUrl, username, password }),
    loginWithOAuth: (baseUrl, clientId, clientSecret) =>
      ipcRenderer.invoke("auth:loginWithOAuth", { baseUrl, clientId, clientSecret }),
    logout: (accountId) => ipcRenderer.invoke("auth:logout", accountId)
  },
  gitea: {
    listRepos: () => ipcRenderer.invoke("gitea:listRepos"),
    listOwners: () => ipcRenderer.invoke("gitea:listOwners"),
    createRepo: (input) => ipcRenderer.invoke("gitea:createRepo", input),
    listBranches: (owner, repo) => ipcRenderer.invoke("gitea:listBranches", { owner, repo }),
    createBranch: (input) => ipcRenderer.invoke("gitea:createBranch", input),
    getRepoOpenCounts: (owner, repo) => ipcRenderer.invoke("gitea:getRepoOpenCounts", { owner, repo })
  },
  settings: {
    get: () => ipcRenderer.invoke("settings:get"),
    setDevToolsEnabled: (enabled) => ipcRenderer.invoke("settings:setDevToolsEnabled", { enabled }),
    setOauthClientId: (clientId) => ipcRenderer.invoke("settings:setOauthClientId", { clientId }),
    setOauthClientSecret: (clientSecret) => ipcRenderer.invoke("settings:setOauthClientSecret", { clientSecret })
  },
  git: {
    getStatus: (repoPath) => ipcRenderer.invoke("git:getStatus", { repoPath }),
    publishFolder: (input) => ipcRenderer.invoke("git:publishFolder", input),
    cloneRepo: (input) => ipcRenderer.invoke("git:cloneRepo", input),
    chooseFolder: () => ipcRenderer.invoke("ui:chooseFolder"),
    watchStatus: (repoPath) => ipcRenderer.invoke("git:watchStatus", { repoPath }),
    unwatchStatus: (repoPath) => ipcRenderer.invoke("git:unwatchStatus", { repoPath }),
    onStatusChanged: (listener) => {
      const handler = (_evt, payload) => listener(payload);
      ipcRenderer.on("git:statusChanged", handler);
      return () => ipcRenderer.removeListener("git:statusChanged", handler);
    },
    onOperationProgress: (listener) => {
      const handler = (_evt, payload) => listener(payload);
      ipcRenderer.on("git:operationProgress", handler);
      return () => ipcRenderer.removeListener("git:operationProgress", handler);
    }
  }
};

contextBridge.exposeInMainWorld("giteaDesktop", api);
