import { app, safeStorage } from "electron";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { Account } from "../shared/types.js";

type StoredAccount = Omit<Account, "token"> & { tokenEncrypted: string };
type StoreFile = { activeAccountId: string | null; accounts: StoredAccount[] };

const getStorePath = () => path.join(app.getPath("userData"), "accounts.json");

const encrypt = (value: string) => {
  if (!safeStorage.isEncryptionAvailable()) {
    const key = crypto.createHash("sha256").update(app.getPath("userData")).digest();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([Buffer.from("v1:"), iv, tag, encrypted]).toString("base64");
  }
  return safeStorage.encryptString(value).toString("base64");
};

const decrypt = (valueEncrypted: string) => {
  const buf = Buffer.from(valueEncrypted, "base64");
  const prefix = buf.subarray(0, 3).toString("utf8");
  if (prefix === "v1:") {
    const iv = buf.subarray(3, 19);
    const tag = buf.subarray(19, 35);
    const encrypted = buf.subarray(35);
    const key = crypto.createHash("sha256").update(app.getPath("userData")).digest();
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString("utf8");
  }
  return safeStorage.decryptString(buf);
};

const readStoreFile = async (): Promise<StoreFile> => {
  const storePath = getStorePath();
  try {
    const raw = await fs.readFile(storePath, "utf8");
    const parsed = JSON.parse(raw) as StoreFile;
    return {
      activeAccountId: parsed.activeAccountId ?? null,
      accounts: Array.isArray(parsed.accounts) ? parsed.accounts : []
    };
  } catch {
    return { activeAccountId: null, accounts: [] };
  }
};

const writeStoreFile = async (file: StoreFile) => {
  const storePath = getStorePath();
  await fs.mkdir(path.dirname(storePath), { recursive: true });
  await fs.writeFile(storePath, JSON.stringify(file, null, 2), "utf8");
};

export const accountStore = {
  async getAccounts(): Promise<Account[]> {
    const file = await readStoreFile();
    return file.accounts.map((a) => ({ ...a, token: decrypt(a.tokenEncrypted) }));
  },
  async getActiveAccount(): Promise<Account | null> {
    const file = await readStoreFile();
    const activeId = file.activeAccountId;
    if (!activeId) return null;
    const stored = file.accounts.find((a) => a.id === activeId);
    if (!stored) return null;
    return { ...stored, token: decrypt(stored.tokenEncrypted) };
  },
  async setActiveAccountId(accountId: string | null): Promise<void> {
    const file = await readStoreFile();
    await writeStoreFile({ ...file, activeAccountId: accountId });
  },
  async upsertAccount(account: Account): Promise<void> {
    const file = await readStoreFile();
    const stored: StoredAccount = { ...account, tokenEncrypted: encrypt(account.token) };
    const existingIndex = file.accounts.findIndex((a) => a.id === account.id);
    const nextAccounts =
      existingIndex >= 0
        ? file.accounts.map((a, idx) => (idx === existingIndex ? stored : a))
        : [...file.accounts, stored];
    await writeStoreFile({ ...file, accounts: nextAccounts });
  },
  async deleteAccount(accountId: string): Promise<void> {
    const file = await readStoreFile();
    await writeStoreFile({ ...file, accounts: file.accounts.filter((a) => a.id !== accountId) });
  }
};
