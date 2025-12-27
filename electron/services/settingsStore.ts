import { app } from "electron";
import fs from "node:fs/promises";
import path from "node:path";

export type AppSettings = {
  devToolsEnabled: boolean;
  oauthClientId: string;
  oauthClientSecret: string;
};

const defaultSettings: AppSettings = {
  devToolsEnabled: false,
  oauthClientId: "",
  oauthClientSecret: ""
};

const getStorePath = () => path.join(app.getPath("userData"), "settings.json");

const readStoreFile = async (): Promise<AppSettings> => {
  const storePath = getStorePath();
  try {
    const raw = await fs.readFile(storePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      devToolsEnabled: Boolean(parsed.devToolsEnabled),
      oauthClientId: typeof parsed.oauthClientId === "string" ? parsed.oauthClientId : "",
      oauthClientSecret: typeof parsed.oauthClientSecret === "string" ? parsed.oauthClientSecret : ""
    };
  } catch {
    return { ...defaultSettings };
  }
};

const writeStoreFile = async (settings: AppSettings) => {
  const storePath = getStorePath();
  await fs.mkdir(path.dirname(storePath), { recursive: true });
  await fs.writeFile(storePath, JSON.stringify(settings, null, 2), "utf8");
};

export const settingsStore = {
  async getSettings(): Promise<AppSettings> {
    return readStoreFile();
  },
  async setDevToolsEnabled(devToolsEnabled: boolean): Promise<AppSettings> {
    const current = await readStoreFile();
    const next: AppSettings = { ...current, devToolsEnabled };
    await writeStoreFile(next);
    return next;
  },
  async setOauthClientId(oauthClientId: string): Promise<AppSettings> {
    const current = await readStoreFile();
    const next: AppSettings = { ...current, oauthClientId };
    await writeStoreFile(next);
    return next;
  },
  async setOauthClientSecret(oauthClientSecret: string): Promise<AppSettings> {
    const current = await readStoreFile();
    const next: AppSettings = { ...current, oauthClientSecret };
    await writeStoreFile(next);
    return next;
  }
};
