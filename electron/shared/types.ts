export type Account = {
  id: string;
  baseUrl: string;
  login: string;
  displayName: string;
  token: string;
};

export type AccountSummary = Omit<Account, "token">;

export type GiteaRepo = {
  id: string;
  owner: string;
  name: string;
  fullName: string;
  cloneUrl: string;
  sshUrl: string;
  defaultBranch: string;
  private: boolean;
};

export type RepoStatus = {
  branch: string | null;
  changed: Array<{ path: string; indexStatus: string; worktreeStatus: string }>;
};

export type GitOperationProgress = {
  opId: string;
  phase: "prepare" | "remote" | "stage" | "commit" | "push" | "done" | "error";
  message: string;
  fileCount?: number;
};

export type PublishFolderInput = {
  folderPath: string;
  remoteUrl: string;
  branch?: string;
  initialCommitMessage?: string;
  opId?: string;
};

export type CloneRepoInput = {
  remoteUrl: string;
  parentPath: string;
  folderName: string;
  branch?: string;
};

export type CloneRepoResult = {
  repoPath: string;
};

export type GiteaOwner = {
  name: string;
  displayName: string;
  type: "user" | "org";
};

export type CreateRepoInput = {
  owner: string;
  name: string;
  description?: string;
  private: boolean;
  autoInit?: boolean;
  defaultBranch?: string;
  gitignoreTemplate?: string;
  licenseTemplate?: string;
};

export type RepoOpenCounts = {
  openIssues: number | null;
  openPulls: number | null;
};

export type CreateBranchInput = {
  owner: string;
  repo: string;
  fromBranch: string;
  newBranch: string;
};
