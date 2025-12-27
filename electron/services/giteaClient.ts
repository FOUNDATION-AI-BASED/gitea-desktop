import type { GiteaRepo } from "../shared/types.js";

type ApiUser = { login: string };
type ApiRepo = {
  id: number;
  name: string;
  full_name: string;
  owner: ApiUser;
  clone_url: string;
  ssh_url: string;
  default_branch: string;
  private: boolean;
};

type ApiOrg = { username: string; full_name?: string };
type ApiBranch = { name: string };

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

class GiteaApiError extends Error {
  status: number;
  url: string;
  bodySnippet: string;

  constructor(status: number, url: string, bodySnippet: string) {
    super(`Gitea API error ${status} for ${url}: ${bodySnippet || "unknown error"}`);
    this.status = status;
    this.url = url;
    this.bodySnippet = bodySnippet;
  }
}

export class GiteaClient {
  private baseUrl: URL;
  private token: string;

  constructor(baseUrl: string, token: string) {
    this.baseUrl = new URL(normalizeGiteaBaseUrl(baseUrl));
    this.token = token;
  }

  private apiUrl(pathWithQuery: string) {
    const url = new URL(this.baseUrl.toString());
    const qIndex = pathWithQuery.indexOf("?");
    const pathname = qIndex >= 0 ? pathWithQuery.slice(0, qIndex) : pathWithQuery;
    const query = qIndex >= 0 ? pathWithQuery.slice(qIndex + 1) : "";
    url.pathname = `${url.pathname.replace(/\/+$/, "")}/api/v1${pathname}`;
    url.search = query ? `?${query}` : "";
    return url.toString();
  }

  private apiUrlWithQueryToken(pathWithQuery: string, tokenParamName: string) {
    const url = new URL(this.apiUrl(pathWithQuery));
    url.searchParams.set(tokenParamName, this.token);
    return url.toString();
  }

  private sanitizeUrlForError(url: string) {
    try {
      const u = new URL(url);
      for (const key of ["access_token", "token", "private_token"]) {
        if (u.searchParams.has(key)) u.searchParams.set(key, "***");
      }
      return u.toString();
    } catch {
      return url;
    }
  }

  private async request<T>(pathname: string): Promise<T> {
    return this.requestWithInit<T>(pathname, {});
  }

  private async requestWithInit<T>(pathname: string, init: RequestInit): Promise<T> {
    const url = this.apiUrl(pathname);
    const doFetch = (urlToFetch: string, authHeader?: string) => {
      const headers = new Headers(init.headers);
      if (authHeader) headers.set("Authorization", authHeader);
      if (!headers.has("Accept")) headers.set("Accept", "application/json");
      if (!headers.has("User-Agent")) headers.set("User-Agent", "gitea-desktop");
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15_000);
      const originalSignal = init.signal;
      const signal = originalSignal ?? controller.signal;
      const promise = fetch(urlToFetch, { ...init, headers, signal });
      promise.finally(() => clearTimeout(timeoutId)).catch(() => undefined);
      return promise;
    };

    let res = await doFetch(url, `token ${this.token}`);
    if (res.status === 401) {
      res = await doFetch(url, `Bearer ${this.token}`);
    }
    if (res.status === 401) {
      res = await doFetch(this.apiUrlWithQueryToken(pathname, "access_token"));
    }
    if (res.status === 401) {
      res = await doFetch(this.apiUrlWithQueryToken(pathname, "token"));
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const compact = text.replace(/\s+/g, " ").trim();
      const snippet = compact.length > 600 ? `${compact.slice(0, 600)}…` : compact;
      throw new GiteaApiError(res.status, this.sanitizeUrlForError(res.url || url), snippet || res.statusText);
    }
    return (await res.json()) as T;
  }

  private async fetchWithInit(pathname: string, init: RequestInit): Promise<Response> {
    const url = this.apiUrl(pathname);
    const doFetch = (urlToFetch: string, authHeader?: string) => {
      const headers = new Headers(init.headers);
      if (authHeader) headers.set("Authorization", authHeader);
      if (!headers.has("Accept")) headers.set("Accept", "application/json");
      if (!headers.has("User-Agent")) headers.set("User-Agent", "gitea-desktop");
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15_000);
      const originalSignal = init.signal;
      const signal = originalSignal ?? controller.signal;
      const promise = fetch(urlToFetch, { ...init, headers, signal });
      promise.finally(() => clearTimeout(timeoutId)).catch(() => undefined);
      return promise;
    };

    let res = await doFetch(url, `token ${this.token}`);
    if (res.status === 401) res = await doFetch(url, `Bearer ${this.token}`);
    if (res.status === 401) res = await doFetch(this.apiUrlWithQueryToken(pathname, "access_token"));
    if (res.status === 401) res = await doFetch(this.apiUrlWithQueryToken(pathname, "token"));
    return res;
  }

  private async postJson<T>(pathname: string, payload: unknown): Promise<T> {
    return this.requestWithInit<T>(pathname, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  }

  async getCurrentUser(): Promise<{ id: number; login: string; full_name?: string; email?: string }> {
    return this.request("/user");
  }

  async listOrgs(): Promise<ApiOrg[]> {
    return this.request<ApiOrg[]>("/user/orgs");
  }

  async listRepos(): Promise<GiteaRepo[]> {
    const mapRepo = (r: ApiRepo): GiteaRepo => ({
      id: String(r.id),
      owner: r.owner?.login ?? "",
      name: r.name ?? "",
      fullName: r.full_name ?? `${r.owner?.login ?? ""}/${r.name ?? ""}`,
      cloneUrl: r.clone_url ?? "",
      sshUrl: r.ssh_url ?? "",
      defaultBranch: r.default_branch ?? "main",
      private: Boolean(r.private)
    });

    const fetchPaged = async (basePath: string) => {
      let first: ApiRepo[] | null = null;
      try {
        const res = await this.request<ApiRepo[]>(basePath);
        first = Array.isArray(res) ? res : [];
      } catch {
        first = null;
      }

      let best = first;
      try {
        const res = await this.request<ApiRepo[]>(`${basePath}?limit=1000`);
        const limited = Array.isArray(res) ? res : [];
        if (!best || limited.length >= best.length) best = limited;
      } catch {
        // ignore
      }

      if (best) return best;

      const perPage = 50;
      const out: ApiRepo[] = [];
      for (let page = 1; page <= 20; page++) {
        let batch: ApiRepo[];
        try {
          batch = await this.request<ApiRepo[]>(`${basePath}?limit=${perPage}&page=${page}`);
        } catch (e) {
          if (e instanceof GiteaApiError && e.status === 404 && page === 1) {
            const single = await this.request<ApiRepo[]>(basePath);
            return Array.isArray(single) ? single : [];
          }
          throw e;
        }
        if (!Array.isArray(batch) || batch.length === 0) break;
        out.push(...batch);
        if (batch.length < perPage) break;
      }
      return out;
    };

    const all = new Map<string, ApiRepo>();

    const userRepos = await fetchPaged("/user/repos");
    for (const r of userRepos) all.set(String(r.id), r);

    let orgs: ApiOrg[] = [];
    try {
      orgs = await this.listOrgs();
    } catch {
      orgs = [];
    }

    for (const org of orgs) {
      const orgName = org.username;
      if (!orgName) continue;
      const safeOrg = encodeURIComponent(orgName);
      let orgRepos: ApiRepo[] = [];
      try {
        orgRepos = await fetchPaged(`/orgs/${safeOrg}/repos`);
      } catch (e) {
        if (e instanceof GiteaApiError && e.status === 404) {
          orgRepos = await fetchPaged(`/org/${safeOrg}/repos`);
        } else {
          throw e;
        }
      }
      for (const r of orgRepos) all.set(String(r.id), r);
    }

    return Array.from(all.values()).map(mapRepo);
  }

  async listBranches(owner: string, repo: string): Promise<string[]> {
    const safeOwner = encodeURIComponent(owner);
    const safeRepo = encodeURIComponent(repo);
    let branches: ApiBranch[];
    try {
      branches = await this.request<ApiBranch[]>(`/repos/${safeOwner}/${safeRepo}/branches?limit=1000`);
    } catch (e) {
      if (e instanceof GiteaApiError && e.status === 404) {
        branches = await this.request<ApiBranch[]>(`/repos/${safeOwner}/${safeRepo}/branches`);
      } else {
        throw e;
      }
    }
    const raw = Array.isArray(branches) ? branches : [];
    return raw.map((b) => (b && typeof b.name === "string" ? b.name : "")).filter(Boolean);
  }

  async getRepoOpenCounts(owner: string, repo: string): Promise<{ openIssues: number | null; openPulls: number | null }> {
    const safeOwner = encodeURIComponent(owner);
    const safeRepo = encodeURIComponent(repo);
    const parseTotal = async (res: Response) => {
      const header = res.headers.get("x-total-count") || res.headers.get("X-Total-Count");
      if (header && /^\d+$/.test(header)) return Number(header);
      try {
        const json = (await res.json()) as unknown;
        return Array.isArray(json) ? json.length : null;
      } catch {
        return null;
      }
    };

    const issuesRes = await this.fetchWithInit(`/repos/${safeOwner}/${safeRepo}/issues?state=open&limit=1`, { method: "GET" });
    const openIssues = issuesRes.ok ? await parseTotal(issuesRes) : null;

    const pullsRes = await this.fetchWithInit(`/repos/${safeOwner}/${safeRepo}/pulls?state=open&limit=1`, { method: "GET" });
    const openPulls = pullsRes.ok ? await parseTotal(pullsRes) : null;

    return { openIssues, openPulls };
  }

  async createBranch(input: { owner: string; repo: string; fromBranch: string; newBranch: string }): Promise<void> {
    const safeOwner = encodeURIComponent(input.owner);
    const safeRepo = encodeURIComponent(input.repo);
    const safeFrom = encodeURIComponent(input.fromBranch);
    const refsRes = await this.fetchWithInit(`/repos/${safeOwner}/${safeRepo}/git/refs/heads/${safeFrom}`, { method: "GET" });
    if (!refsRes.ok) {
      const text = await refsRes.text().catch(() => "");
      const compact = text.replace(/\s+/g, " ").trim();
      const snippet = compact.length > 200 ? `${compact.slice(0, 200)}…` : compact;
      throw new Error(`Failed to read branch ref: ${snippet || refsRes.statusText}`);
    }
    const json = (await refsRes.json()) as unknown;
    const refObj = Array.isArray(json) ? (json[0] as Record<string, unknown> | undefined) : (json as Record<string, unknown>);
    const object = (refObj && typeof refObj.object === "object" && refObj.object !== null ? (refObj.object as Record<string, unknown>) : null) || null;
    const sha = (object && typeof object.sha === "string" ? object.sha : "") || "";
    if (!sha) throw new Error("Could not determine base branch SHA");
    const body = { ref: `refs/heads/${input.newBranch}`, sha };
    await this.postJson(`/repos/${safeOwner}/${safeRepo}/git/refs`, body);
  }

  async createRepo(input: {
    owner: string;
    name: string;
    description?: string;
    private: boolean;
    autoInit?: boolean;
    defaultBranch?: string;
    gitignoreTemplate?: string;
    licenseTemplate?: string;
  }): Promise<GiteaRepo> {
    const payload: Record<string, unknown> = {
      name: input.name,
      private: Boolean(input.private)
    };
    if (input.description) payload.description = input.description;
    if (typeof input.autoInit === "boolean") payload.auto_init = input.autoInit;
    if (input.defaultBranch) payload.default_branch = input.defaultBranch;
    if (input.gitignoreTemplate) payload.gitignores = input.gitignoreTemplate;
    if (input.licenseTemplate) payload.license = input.licenseTemplate;

    const orgEndpoint = input.owner ? `/orgs/${encodeURIComponent(input.owner)}/repos` : null;
    const endpoint = orgEndpoint ?? "/user/repos";
    let created: ApiRepo;
    try {
      try {
        created = await this.postJson<ApiRepo>(endpoint, payload);
      } catch (e) {
        if (e instanceof GiteaApiError && e.status === 404 && orgEndpoint) {
          created = await this.postJson<ApiRepo>(`/org/${encodeURIComponent(input.owner)}/repos`, payload);
        } else {
          throw e;
        }
      }
    } catch (e) {
      if (e instanceof GiteaApiError && (e.status === 400 || e.status === 422)) {
        const minimal = { name: input.name, private: Boolean(input.private) };
        try {
          created = await this.postJson<ApiRepo>(endpoint, minimal);
        } catch (e2) {
          if (e2 instanceof GiteaApiError && e2.status === 404 && orgEndpoint) {
            created = await this.postJson<ApiRepo>(`/org/${encodeURIComponent(input.owner)}/repos`, minimal);
          } else {
            throw e2;
          }
        }
      } else {
        throw e;
      }
    }
    return {
      id: String(created.id),
      owner: created.owner?.login ?? input.owner,
      name: created.name ?? input.name,
      fullName: created.full_name ?? `${created.owner?.login ?? input.owner}/${created.name ?? input.name}`,
      cloneUrl: created.clone_url ?? "",
      sshUrl: created.ssh_url ?? "",
      defaultBranch: created.default_branch ?? "main",
      private: Boolean(created.private)
    };
  }
}
