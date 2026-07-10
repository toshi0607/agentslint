import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readdir } from "node:fs/promises";
import path from "node:path";
import type { FileKind } from "./types.js";

const execFileAsync = promisify(execFile);

const FS_WALK_SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", "vendor"]);

export interface DiscoveredFile {
  /** discover ルートからの相対パス。POSIX 区切り(/)。 */
  relPath: string;
  /** 絶対パス。 */
  absPath: string;
  kind: FileKind;
}

/** ファイル名/パスから対象種別を判定する。対象外なら null。 */
function classify(relPath: string): FileKind | null {
  const posixPath = relPath.split(path.sep).join("/");
  const base = posixPath.slice(posixPath.lastIndexOf("/") + 1);

  if (base === "AGENTS.md") return "agents-md";
  if (base === "CLAUDE.md") return "claude-md";

  const segments = posixPath.split("/");
  // .claude/skills/<name>/SKILL.md (任意階層の .claude/skills/*/SKILL.md)
  if (
    base === "SKILL.md" &&
    segments.length >= 3 &&
    segments[segments.length - 2] !== undefined &&
    segments[segments.length - 3] === "skills" &&
    segments[segments.length - 4] === ".claude"
  ) {
    return "skill";
  }
  // .claude/settings.json / .claude/settings.local.json (任意階層)
  if (
    (base === "settings.json" || base === "settings.local.json") &&
    segments.length >= 2 &&
    segments[segments.length - 2] === ".claude"
  ) {
    return "settings";
  }

  return null;
}

/** cwd が git 作業ツリー内かどうかを判定する。 */
async function isInsideGitWorkTree(cwd: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "--is-inside-work-tree"], {
      cwd,
    });
    return stdout.trim() === "true";
  } catch {
    return false;
  }
}

/** git 管理下のファイル一覧(追跡済み + 未追跡だが .gitignore 対象外)を取得する。 */
async function listGitFiles(repoRoot: string): Promise<string[]> {
  const { stdout } = await execFileAsync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard"],
    { cwd: repoRoot, maxBuffer: 1024 * 1024 * 64 },
  );
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/** git のリポジトリルート(worktree のトップ)を取得する。 */
async function getGitRoot(cwd: string): Promise<string> {
  const { stdout } = await execFileAsync("git", ["rev-parse", "--show-toplevel"], { cwd });
  return stdout.trim();
}

/**
 * リポジトリルートを解決する。git 作業ツリー内であればそのルート、
 * そうでなければ cwd 自身を返す。AL002 の Makefile/justfile/package.json
 * 探索の上限境界(「リポジトリルートまで」)として使う。
 */
export async function resolveRepoRoot(cwd: string): Promise<string> {
  if (await isInsideGitWorkTree(cwd)) {
    return getGitRoot(cwd);
  }
  return cwd;
}

/** node_modules 等を除いて再帰的にファイルを列挙する(git 管理外の場合のフォールバック)。 */
async function walkFs(root: string, dir: string, out: string[]): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (FS_WALK_SKIP_DIRS.has(entry.name)) continue;
      await walkFs(root, path.join(dir, entry.name), out);
    } else if (entry.isFile()) {
      out.push(path.relative(root, path.join(dir, entry.name)));
    }
  }
}

/**
 * 対象ファイルを探索する。
 * - git 作業ツリー内: `git ls-files --cached --others --exclude-standard` の結果から選ぶ(.gitignore 尊重)
 * - git 外: fs 再帰(node_modules, .git, dist, build, vendor をスキップ)
 *
 * @param cwd 探索の起点ディレクトリ(絶対パス)。
 */
export async function discover(cwd: string): Promise<DiscoveredFile[]> {
  let root: string;
  let candidates: string[];

  if (await isInsideGitWorkTree(cwd)) {
    root = await getGitRoot(cwd);
    candidates = await listGitFiles(root);
  } else {
    root = cwd;
    const collected: string[] = [];
    await walkFs(root, root, collected);
    candidates = collected;
  }

  const results: DiscoveredFile[] = [];
  for (const relToRoot of candidates) {
    const kind = classify(relToRoot);
    if (!kind) continue;
    const absPath = path.join(root, relToRoot);
    const relFromCwd = path.relative(cwd, absPath);
    // discover は cwd 配下に限定する(git ルートがより上位のディレクトリでも、
    // cwd の外側にあるファイルは対象にしない)。
    if (relFromCwd.startsWith("..") || path.isAbsolute(relFromCwd)) continue;
    const relPath = relFromCwd.split(path.sep).join("/");
    results.push({ relPath, absPath, kind });
  }

  return results;
}
