import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { extractLinks } from "../parse/markdown.js";
import { extractImportTokens } from "../parse/imports.js";
import type { Finding, Rule, RuleContext } from "../types.js";

const RULE_ID = "AL001";
const RULE_NAME = "broken-file-reference";

/** リンク URL が「相対パスのファイル参照」として検証対象かどうかを判定する。 */
function isCheckableRelativePath(url: string): boolean {
  const trimmed = url.trim();
  if (trimmed === "") return false;
  // アンカーのみ(#section)はスキップ。
  if (trimmed.startsWith("#")) return false;
  // スキーム付き URL(http:, https:, mailto:, ftp: 等)はスキップ。
  // "scheme:" の直後が "//" でなくても mailto: のようにスキームとみなす。
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) return false;
  // 絶対パス(/ 始まり)はスキップ(仕様は「相対パス」のみを対象とする)。
  if (trimmed.startsWith("/")) return false;
  // プロトコル相対 URL(//example.com)もスキップ。
  if (trimmed.startsWith("//")) return false;
  return true;
}

/** `path#anchor` からパス部分のみを取り出す。クエリ文字列 `?` も同様に切り落とす。 */
function stripAnchorAndQuery(url: string): string {
  const hashIndex = url.indexOf("#");
  const queryIndex = url.indexOf("?");
  let end = url.length;
  if (hashIndex >= 0) end = Math.min(end, hashIndex);
  if (queryIndex >= 0) end = Math.min(end, queryIndex);
  return url.slice(0, end);
}

/** %エンコードされたパス(`my%20file.md` 等)をデコードする。不正な % シーケンスの場合は raw をそのまま返す。 */
function tryDecodeUriPath(pathPart: string): string {
  try {
    return decodeURIComponent(pathPart);
  } catch {
    return pathPart;
  }
}

/**
 * @import トークンが「プレフィックスなし複数セグメント」形式(@dir/.../name.ext)かどうかを判定する。
 * この形式は npm scoped package(@scope/pkg.md 等)と字面上区別できないため、
 * 先頭セグメントが実在するディレクトリのときのみ import として扱う(呼び出し側で判定)。
 */
function isPrefixlessMultiSegment(importPath: string): boolean {
  return !importPath.startsWith("./") && !importPath.startsWith("../") && importPath.includes("/");
}

function isExistingDirectory(absPath: string): boolean {
  try {
    return statSync(absPath).isDirectory();
  } catch {
    return false;
  }
}

export const al001: Rule = {
  id: RULE_ID,
  name: RULE_NAME,
  defaultSeverity: "error",
  appliesTo: ["agents-md", "claude-md", "skill"],
  check(ctx: RuleContext): Finding[] {
    const findings: Finding[] = [];
    const { file, config } = ctx;
    const severity = config.severity;
    const fileDir = path.dirname(file.absPath);

    // (a) markdown リンク先の相対パス検証。
    if (file.md) {
      for (const link of extractLinks(file.md)) {
        if (!isCheckableRelativePath(link.url)) continue;
        const pathPart = stripAnchorAndQuery(link.url);
        if (pathPart === "") continue; // "#anchor" 等、パス部が空になったものは対象外。
        const decodedPathPart = tryDecodeUriPath(pathPart);
        // raw 表記(%20 等そのまま)とデコード後表記のどちらかがファイルとして存在すれば OK とする。
        // decodeURIComponent が失敗した場合は tryDecodeUriPath が raw を返すため、二重チェックにはならない。
        const existsRaw = existsSync(path.resolve(fileDir, pathPart));
        const existsDecoded =
          decodedPathPart === pathPart ? existsRaw : existsSync(path.resolve(fileDir, decodedPathPart));
        if (!existsRaw && !existsDecoded) {
          findings.push({
            ruleId: RULE_ID,
            ruleName: RULE_NAME,
            severity,
            file: file.relPath,
            line: link.line,
            message: `リンク先ファイルが見つかりません: ${link.url}`,
          });
        }
      }
    }

    // (b) CLAUDE.md のみ: @import トークンの解決先検証。
    if (file.kind === "claude-md" && file.md) {
      for (const token of extractImportTokens(file.md)) {
        // プレフィックスなし複数セグメント(@dir/.../name.ext)は、先頭セグメントが実在する
        // ディレクトリのときのみチェックする。実在しなければ npm scoped package 等と区別
        // できないため黙ってスキップする(誤検知ゼロを優先)。
        if (isPrefixlessMultiSegment(token.path)) {
          const leadSegment = token.path.slice(0, token.path.indexOf("/"));
          if (!isExistingDirectory(path.join(fileDir, leadSegment))) continue;
        }
        const resolved = path.resolve(fileDir, token.path);
        if (!existsSync(resolved)) {
          findings.push({
            ruleId: RULE_ID,
            ruleName: RULE_NAME,
            severity,
            file: file.relPath,
            line: token.line,
            message: `@import 先ファイルが見つかりません: ${token.raw}`,
          });
        }
      }
    }

    return findings;
  },
};
