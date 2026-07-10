import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { extractCodeBlocks, extractInlineCode } from "../parse/markdown.js";
import type { Finding, Rule, RuleContext } from "../types.js";

const RULE_ID = "AL002";
const RULE_NAME = "stale-command";

const SHELL_LANGS = new Set(["bash", "sh", "shell", "zsh", "console", ""]);

type PackageManager = "npm" | "pnpm" | "yarn";

interface ExtractedCommand {
  kind: PackageManager | "make" | "just";
  target: string;
  line: number;
}

const COMMAND_RE =
  /\b(npm|pnpm|yarn)\s+run\s+([A-Za-z0-9_:.-]+)|\bmake\s+([A-Za-z0-9_.-]+)|\bjust\s+([A-Za-z0-9_-]+)/g;

/** シェルのコマンド開始を示す区切りトークン。この直後の位置もコマンド位置として扱う。 */
const COMMAND_LEAD_IN_TOKENS = ["&&", "||", ";", "|", "$("];

/**
 * `line` 中の `position` が「コマンド位置」かどうかを判定する。
 * コマンド位置 = 行頭(前置空白・`ENV=x` 形式の環境変数代入は許容)、または
 * `&&` `||` `;` `|` `$(` の直後(間に空白のみを挟むのは許容)。
 * これにより `# npm run x`(コメント)や `echo 'npm run x'`(文字列内)は自然に対象外になる。
 */
function isCommandPosition(line: string, position: number): boolean {
  const before = line.slice(0, position);
  // 行頭(前置空白 + 0 個以上の "NAME=value " 環境変数代入)のみで構成されているか。
  if (/^[ \t]*(?:[A-Za-z_][A-Za-z0-9_]*=\S*[ \t]+)*$/.test(before)) return true;
  // 直前の空白のみを剥がし、区切りトークンの直後かどうかを見る。
  const trimmed = before.replace(/[ \t]+$/, "");
  return COMMAND_LEAD_IN_TOKENS.some((token) => trimmed.endsWith(token));
}

interface RawCommandMatch {
  index: number;
  kind: PackageManager | "make" | "just";
  target: string;
}

/** テキスト全体から COMMAND_RE にマッチする候補を(位置フィルタなしで)全て集める。 */
function matchCommands(text: string): RawCommandMatch[] {
  const found: RawCommandMatch[] = [];
  for (const match of text.matchAll(COMMAND_RE)) {
    if (match.index === undefined) continue;
    if (match[1] !== undefined && match[2] !== undefined) {
      found.push({ index: match.index, kind: match[1] as PackageManager, target: match[2] });
    } else if (match[3] !== undefined) {
      found.push({ index: match.index, kind: "make", target: match[3] });
    } else if (match[4] !== undefined) {
      found.push({ index: match.index, kind: "just", target: match[4] });
    }
  }
  return found;
}

/** フェンスコードブロック内の 1 行からコマンド位置にあるコマンドトークンのみ抽出する。 */
function extractCommandsFromFencedLine(lineText: string, line: number): ExtractedCommand[] {
  return matchCommands(lineText)
    .filter((m) => isCommandPosition(lineText, m.index))
    .map((m) => ({ kind: m.kind, target: m.target, line }));
}

/** インラインコードスパンから、スパン先頭位置(index 0)のコマンドトークンのみ抽出する。 */
function extractCommandsFromInlineSpan(spanValue: string, line: number): ExtractedCommand[] {
  return matchCommands(spanValue)
    .filter((m) => m.index === 0)
    .map((m) => ({ kind: m.kind, target: m.target, line }));
}

/** 対象ファイルからコマンド抽出対象のコードスパン(フェンス+インライン)を集める。 */
function collectCommandsFromMd(file: RuleContext["file"]): ExtractedCommand[] {
  if (!file.md) return [];
  const commands: ExtractedCommand[] = [];

  for (const block of extractCodeBlocks(file.md)) {
    const lang = (block.lang ?? "").toLowerCase();
    if (!SHELL_LANGS.has(lang)) continue;
    // ブロック内の各行の相対行番号を考慮して抽出する。
    const lines = block.value.split("\n");
    lines.forEach((lineText, idx) => {
      commands.push(...extractCommandsFromFencedLine(lineText, block.line + idx + 1));
    });
  }

  for (const span of extractInlineCode(file.md)) {
    commands.push(...extractCommandsFromInlineSpan(span.value, span.line));
  }

  return commands;
}

/** dir から上方向に filename を探索する。foundAt に見つかったディレクトリ、なければ null。 */
function findUpward(startDir: string, boundaryDir: string, filename: string): string | null {
  let dir = startDir;
  const boundary = path.resolve(boundaryDir);
  for (;;) {
    const candidate = path.join(dir, filename);
    if (existsSync(candidate)) return candidate;
    if (path.resolve(dir) === boundary) return null;
    const parent = path.dirname(dir);
    if (parent === dir) return null; // filesystem root
    dir = parent;
  }
}

/** package.json の scripts キー一覧を読む。読めない/壊れている場合は null。 */
function readPackageScripts(packageJsonPath: string): Set<string> | null {
  try {
    const raw = readFileSync(packageJsonPath, "utf8");
    const parsed = JSON.parse(raw) as { scripts?: Record<string, unknown> };
    if (!parsed.scripts || typeof parsed.scripts !== "object") return new Set();
    return new Set(Object.keys(parsed.scripts));
  } catch {
    return null;
  }
}

/** Makefile からターゲット名一覧を抽出する。 */
function extractMakeTargets(makefilePath: string): Set<string> {
  const targets = new Set<string>();
  let content: string;
  try {
    content = readFileSync(makefilePath, "utf8");
  } catch {
    return targets;
  }
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    if (line.includes("=")) continue; // 変数行は除外(:= 等も = を含むため除外される)
    if (/^\.PHONY\b/.test(line)) continue; // .PHONY 自体はターゲットではない
    const m = line.match(/^([A-Za-z0-9_.-]+)\s*:/);
    if (m && m[1] !== undefined) targets.add(m[1]);
  }
  for (const line of lines) {
    const m = line.match(/^\.PHONY\s*:\s*(.+)$/);
    if (m && m[1] !== undefined) {
      for (const name of m[1].split(/\s+/)) {
        if (name) targets.add(name);
      }
    }
  }
  return targets;
}

/** justfile からレシピ名一覧を抽出する。 */
function extractJustRecipes(justfilePath: string): Set<string> {
  const recipes = new Set<string>();
  let content: string;
  try {
    content = readFileSync(justfilePath, "utf8");
  } catch {
    return recipes;
  }
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    if (line.trim().startsWith("#")) continue;
    if (/:=/.test(line)) continue; // 変数代入は除外
    const m = line.match(/^([A-Za-z0-9_-]+)[^:\n]*:(?!=)/);
    if (m && m[1] !== undefined) recipes.add(m[1]);
  }
  return recipes;
}

export const al002: Rule = {
  id: RULE_ID,
  name: RULE_NAME,
  defaultSeverity: "warn",
  appliesTo: ["agents-md", "claude-md"],
  check(ctx: RuleContext): Finding[] {
    const findings: Finding[] = [];
    const { file, config, rootDir } = ctx;
    const severity = config.severity;
    const fileDir = path.dirname(file.absPath);

    const commands = collectCommandsFromMd(file);
    if (commands.length === 0) return findings;

    // npm/pnpm/yarn: 最も近い package.json をキャッシュして使い回す。
    let packageJsonPath: string | null | undefined; // undefined = 未探索
    let scripts: Set<string> | null | undefined;

    // make/just: リポジトリルート(rootDir)までに Makefile/justfile があるか。
    let makefilePath: string | null | undefined;
    let makeTargets: Set<string> | undefined;
    let justfilePath: string | null | undefined;
    let justRecipes: Set<string> | undefined;

    for (const cmd of commands) {
      if (cmd.kind === "npm" || cmd.kind === "pnpm" || cmd.kind === "yarn") {
        if (packageJsonPath === undefined) {
          packageJsonPath = findUpward(fileDir, rootDir, "package.json");
          scripts = packageJsonPath ? readPackageScripts(packageJsonPath) : null;
        }
        if (!packageJsonPath || !scripts) continue; // マニフェストが無ければスキップ(誤検知ゼロ優先)
        if (!scripts.has(cmd.target)) {
          findings.push({
            ruleId: RULE_ID,
            ruleName: RULE_NAME,
            severity,
            file: file.relPath,
            line: cmd.line,
            message: `"${cmd.kind} run ${cmd.target}" は package.json の scripts に見つかりません`,
          });
        }
        continue;
      }

      if (cmd.kind === "make") {
        if (makefilePath === undefined) {
          makefilePath = findUpward(fileDir, rootDir, "Makefile");
          makeTargets = makefilePath ? extractMakeTargets(makefilePath) : undefined;
        }
        if (!makefilePath) {
          findings.push({
            ruleId: RULE_ID,
            ruleName: RULE_NAME,
            severity,
            file: file.relPath,
            line: cmd.line,
            message: `"make ${cmd.target}" が参照されていますが、Makefile がリポジトリ内に見つかりません`,
          });
          continue;
        }
        if (!makeTargets?.has(cmd.target)) {
          findings.push({
            ruleId: RULE_ID,
            ruleName: RULE_NAME,
            severity,
            file: file.relPath,
            line: cmd.line,
            message: `"make ${cmd.target}" は Makefile のターゲットに見つかりません`,
          });
        }
        continue;
      }

      // cmd.kind === "just"
      if (justfilePath === undefined) {
        justfilePath = findUpward(fileDir, rootDir, "justfile");
        justRecipes = justfilePath ? extractJustRecipes(justfilePath) : undefined;
      }
      if (!justfilePath) {
        findings.push({
          ruleId: RULE_ID,
          ruleName: RULE_NAME,
          severity,
          file: file.relPath,
          line: cmd.line,
          message: `"just ${cmd.target}" が参照されていますが、justfile がリポジトリ内に見つかりません`,
        });
        continue;
      }
      if (!justRecipes?.has(cmd.target)) {
        findings.push({
          ruleId: RULE_ID,
          ruleName: RULE_NAME,
          severity,
          file: file.relPath,
          line: cmd.line,
          message: `"just ${cmd.target}" は justfile のレシピに見つかりません`,
        });
      }
    }

    return findings;
  },
};
