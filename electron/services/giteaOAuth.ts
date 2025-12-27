import crypto from "node:crypto";
import http from "node:http";
import { BrowserWindow, shell } from "electron";

const base64Url = (buf: Buffer) =>
  buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

const sha256Base64Url = (input: string) => base64Url(crypto.createHash("sha256").update(input).digest());

const readBody = async (res: Response) => {
  const contentType = res.headers.get("content-type") || "";
  const text = await res.text();
  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return text;
    }
  }
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const params = new URLSearchParams(text);
    return Object.fromEntries(params.entries());
  }
  return text;
};

const stringifyBodyForError = (body: unknown) => {
  if (typeof body === "string") return body;
  try {
    return JSON.stringify(body);
  } catch {
    return String(body);
  }
};

const normalizeGiteaBaseUrl = (baseUrl: string) => {
  const normalized = baseUrl.replace(/\/+$/, "");
  const url = new URL(normalized);
  url.pathname = url.pathname.replace(/\/+$/, "");
  if (url.pathname.endsWith("/api/v1")) {
    url.pathname = url.pathname.slice(0, -"/api/v1".length) || "/";
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  }
  return url.toString().replace(/\/+$/, "");
};

const tokenEndpoint = (baseUrl: string) => {
  const url = new URL(normalizeGiteaBaseUrl(baseUrl));
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/login/oauth/access_token`;
  return url.toString();
};

const authorizeEndpoint = (baseUrl: string) => {
  const url = new URL(normalizeGiteaBaseUrl(baseUrl));
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/login/oauth/authorize`;
  return url.toString();
};

const tokenRequest = async (
  baseUrl: string,
  clientId: string,
  clientSecret: string | undefined,
  input: { code: string; redirectUri: string; codeVerifier: string; includeGrantType: boolean; useJson: boolean; useBasicAuth: boolean }
) => {
  const url = tokenEndpoint(baseUrl);

  const bodyObj: Record<string, string> = {
    client_id: clientId,
    code: input.code,
    redirect_uri: input.redirectUri,
    code_verifier: input.codeVerifier
  };
  if (input.includeGrantType) bodyObj.grant_type = "authorization_code";
  if (clientSecret) bodyObj.client_secret = clientSecret;

  const headers: Record<string, string> = {
    Accept: "application/json"
  };

  if (input.useBasicAuth && clientSecret) {
    headers.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
  }

  let body: string;
  if (input.useJson) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(bodyObj);
  } else {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    body = new URLSearchParams(bodyObj).toString();
  }

  const res = await fetch(url, { method: "POST", headers, body });
  return res;
};

const extractAccessToken = (body: unknown) => {
  const tokenObj = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : null;
  const accessToken =
    (tokenObj && typeof tokenObj.access_token === "string" ? tokenObj.access_token : "") ||
    (tokenObj && typeof tokenObj.token === "string" ? tokenObj.token : "");
  return accessToken;
};

export const oauthLoginWithPkce = async (
  baseUrl: string,
  clientId: string,
  clientSecret?: string
): Promise<string> => {
  if (!clientSecret || !clientSecret.trim()) {
    throw new Error("OAuth client secret is required");
  }
  const state = base64Url(crypto.randomBytes(16));
  const codeVerifier = base64Url(crypto.randomBytes(32));
  const codeChallenge = sha256Base64Url(codeVerifier);
  const redirectUri = "http://127.0.0.1:17171/oauth/callback";

  const authResult = await new Promise<{ code: string; redirectUri: string }>((resolve, reject) => {
    let authWin: BrowserWindow | null = null;
    let finished = false;
    const server = http.createServer((req, res) => {
      try {
        if (!req.url) {
          res.statusCode = 400;
          res.end("Bad request");
          return;
        }
        const url = new URL(req.url, "http://127.0.0.1");
        if (url.pathname !== "/oauth/callback") {
          res.statusCode = 404;
          res.end("Not found");
          return;
        }

        const code = url.searchParams.get("code");
        const gotState = url.searchParams.get("state");
        const err = url.searchParams.get("error");
        const errDesc = url.searchParams.get("error_description");

        res.setHeader("Content-Type", "text/html; charset=utf-8");
        if (err) {
          res.statusCode = 400;
          res.end(`<h1>Login failed</h1><p>${escapeHtml(errDesc || err)}</p>`);
          finished = true;
          if (authWin) authWin.close();
          server.close();
          reject(new Error(errDesc || err));
          return;
        }

        if (!code || !gotState || gotState !== state) {
          res.statusCode = 400;
          res.end("<h1>Login failed</h1><p>Missing or invalid callback parameters.</p>");
          finished = true;
          if (authWin) authWin.close();
          server.close();
          reject(new Error("OAuth callback missing code/state"));
          return;
        }

        res.statusCode = 200;
        res.end("<h1>Login complete</h1><p>Returning to the app…</p><script>setTimeout(() => window.close(), 250);</script>");
        finished = true;
        if (authWin) authWin.close();
        server.close();
        resolve({ code, redirectUri });
      } catch (e) {
        res.statusCode = 500;
        res.end("Internal error");
        finished = true;
        if (authWin) authWin.close();
        server.close();
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    });

    server.on("error", (e) => reject(e));
    server.listen(17171, "127.0.0.1", async () => {
      const url = new URL(authorizeEndpoint(baseUrl));
      url.searchParams.set("client_id", clientId);
      url.searchParams.set("redirect_uri", redirectUri);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("state", state);
      url.searchParams.set("code_challenge", codeChallenge);
      url.searchParams.set("code_challenge_method", "S256");
      url.searchParams.set("scope", "read:user read:repository");

      authWin = new BrowserWindow({
        width: 980,
        height: 820,
        show: true,
        autoHideMenuBar: true,
        title: "Sign in to Gitea",
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false
        }
      });

      authWin.webContents.setWindowOpenHandler(({ url }) => {
        void shell.openExternal(url);
        return { action: "deny" };
      });

      authWin.on("closed", () => {
        authWin = null;
        if (!finished) {
          finished = true;
          server.close();
          reject(new Error("OAuth window was closed"));
        }
      });

      await authWin.loadURL(url.toString());
    });

    setTimeout(() => {
      finished = true;
      if (authWin) authWin.close();
      server.close();
      reject(new Error("OAuth login timed out"));
    }, 3 * 60 * 1000).unref?.();
  });

  const attempts = [
    { includeGrantType: true, useJson: false, useBasicAuth: false },
    { includeGrantType: false, useJson: false, useBasicAuth: false },
    { includeGrantType: true, useJson: true, useBasicAuth: false },
    { includeGrantType: true, useJson: false, useBasicAuth: true }
  ] as const;

  let lastError: string | null = null;
  for (const a of attempts) {
    const res = await tokenRequest(baseUrl, clientId, clientSecret, {
      code: authResult.code,
      redirectUri: authResult.redirectUri,
      codeVerifier,
      includeGrantType: a.includeGrantType,
      useJson: a.useJson,
      useBasicAuth: a.useBasicAuth
    });
    const body = await readBody(res);
    if (!res.ok) {
      lastError = `(${res.status}) ${stringifyBodyForError(body)}`;
      continue;
    }
    const accessToken = extractAccessToken(body);
    if (!accessToken) {
      lastError = `(${res.status}) token response missing access_token: ${stringifyBodyForError(body)}`;
      continue;
    }
    return accessToken;
  }

  throw new Error(
    `OAuth token exchange failed: ${lastError || "unknown error"}. Check that Client ID, Client Secret, and Redirect URL match exactly.`
  );
};

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
