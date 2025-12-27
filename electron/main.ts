import { app, BrowserWindow, ipcMain, shell } from "electron";
import path from "node:path";
import { registerIpc } from "./ipc.js";
import { settingsStore } from "./services/settingsStore.js";

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");

const createMainWindow = () => {
  const preloadPath = path.join(app.getAppPath(), "electron", "preload.cjs");

  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  const showLoadFailure = (url: string, errorDescription: string) => {
    const html = `<!doctype html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Gitea Desktop</title>
  <style>
    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; padding: 24px; background: #0b1220; color: #e5e7eb; }
    .card { max-width: 760px; margin: 0 auto; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); border-radius: 14px; padding: 18px; }
    .title { font-size: 18px; font-weight: 700; margin: 0 0 8px; }
    .muted { color: #a7b0c0; font-size: 13px; line-height: 1.5; }
    code { background: rgba(0,0,0,0.35); padding: 2px 6px; border-radius: 6px; }
    button { margin-top: 12px; padding: 10px 12px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.16); background: rgba(255,255,255,0.08); color: #e5e7eb; cursor: pointer; }
    button:hover { background: rgba(255,255,255,0.12); }
  </style>
</head>
<body>
  <div class="card">
    <div class="title">Failed to load app UI</div>
    <div class="muted">Tried to load: <code>${escapeHtml(url)}</code></div>
    <div class="muted">Error: <code>${escapeHtml(errorDescription)}</code></div>
    <div class="muted" style="margin-top:10px;">In dev mode, ensure the Vite dev server is running.</div>
    <button onclick="location.reload()">Retry</button>
  </div>
</body>
</html>`;
    void win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  };

  win.webContents.on("did-fail-load", (_evt, code, desc, validatedUrl) => {
    if (code === -3) return;
    showLoadFailure(validatedUrl, desc);
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    void win.loadURL(devUrl);
  } else {
    const indexHtml = path.join(app.getAppPath(), "dist", "renderer", "index.html");
    void win.loadFile(indexHtml);
  }

  return win;
};

app.whenReady().then(async () => {
  const win = createMainWindow();
  registerIpc(ipcMain, win);
  const settings = await settingsStore.getSettings();
  if (settings.devToolsEnabled) {
    win.webContents.openDevTools({ mode: "detach" });
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
});
