import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseMarkdown, parseFrontmatter } from "../src/parse/markdown.js";
import type { FileContext, FileKind, ResolvedRuleConfig, RuleContext, Severity } from "../src/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const FIXTURES_ROOT = path.resolve(__dirname, "..", "fixtures");

/** fixtures/ 以下の絶対パスを組み立てる。 */
export function fixturePath(...segments: string[]): string {
  return path.join(FIXTURES_ROOT, ...segments);
}

/**
 * fixtures 内の実ファイルを読み込み FileContext を組み立てる。
 * @param absPath ファイルの絶対パス。
 * @param relPath 報告用の相対パス(通常 fixtures ルートからの相対)。
 * @param kind ファイル種別。
 */
export async function loadFileContext(absPath: string, relPath: string, kind: FileKind): Promise<FileContext> {
  const content = await readFile(absPath, "utf8");
  const isMarkdown = kind === "agents-md" || kind === "claude-md" || kind === "skill";
  const ctx: FileContext = { kind, relPath, absPath, content };
  if (isMarkdown) {
    ctx.md = parseMarkdown(content);
  }
  if (kind === "skill") {
    ctx.frontmatter = parseFrontmatter(content);
  }
  return ctx;
}

/** テスト用の RuleContext を組み立てる(デフォルト severity・空 options)。 */
export function makeRuleContext(
  file: FileContext,
  options: {
    severity?: Severity;
    ruleOptions?: Record<string, unknown>;
    allFiles?: FileContext[];
    rootDir?: string;
  } = {},
): RuleContext {
  const config: ResolvedRuleConfig = {
    enabled: true,
    severity: options.severity ?? "error",
    options: options.ruleOptions ?? {},
  };
  return {
    file,
    config,
    allFiles: options.allFiles ?? [file],
    rootDir: options.rootDir ?? path.dirname(file.absPath),
  };
}
