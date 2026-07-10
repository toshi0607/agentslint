import { readFile } from "node:fs/promises";
import path from "node:path";
import type { AgentslintConfig, ResolvedRuleConfig, RuleConfigEntry, Severity } from "./types.js";

const VALID_SEVERITIES: readonly Severity[] = ["error", "warn", "info"];

export class ConfigError extends Error {}

/**
 * .agentslintrc.json を読み込む。
 * @param cwd カレントディレクトリ(既定の設定ファイル探索先)。
 * @param explicitPath --config で指定されたパス(あれば優先)。
 * @returns 設定ファイルが存在しない場合は空の設定({})。
 * @throws ConfigError JSON として不正な場合。
 */
export async function loadConfig(cwd: string, explicitPath?: string): Promise<AgentslintConfig> {
  const configPath = explicitPath
    ? path.resolve(cwd, explicitPath)
    : path.join(cwd, ".agentslintrc.json");

  let raw: string;
  try {
    raw = await readFile(configPath, "utf8");
  } catch (err) {
    if (explicitPath) {
      throw new ConfigError(`設定ファイルが読み込めません: ${configPath} (${(err as Error).message})`);
    }
    return {};
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new ConfigError(`設定ファイルの JSON が不正です: ${configPath} (${(err as Error).message})`);
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new ConfigError(`設定ファイルはオブジェクトである必要があります: ${configPath}`);
  }

  return parsed as AgentslintConfig;
}

/**
 * ルール ID の設定を解決する。
 * @param ruleId ルール ID(例: "AL003")。
 * @param defaultSeverity ルールの既定 severity。
 * @param config 読み込み済みの .agentslintrc.json。
 */
export function resolveRuleConfig(
  ruleId: string,
  defaultSeverity: Severity,
  config: AgentslintConfig,
): ResolvedRuleConfig {
  const entry: RuleConfigEntry | undefined = config.rules?.[ruleId];

  if (entry === undefined) {
    return { enabled: true, severity: defaultSeverity, options: {} };
  }
  if (entry === "off") {
    return { enabled: false, severity: defaultSeverity, options: {} };
  }
  if (typeof entry === "string") {
    if (VALID_SEVERITIES.includes(entry)) {
      return { enabled: true, severity: entry, options: {} };
    }
    // 不正な文字列値は既定値にフォールバックする(誤検知ゼロ優先: 壊れた設定で誤動作させない)。
    return { enabled: true, severity: defaultSeverity, options: {} };
  }
  // オブジェクト形式 { severity?, options? }
  const severity =
    entry.severity && VALID_SEVERITIES.includes(entry.severity) ? entry.severity : defaultSeverity;
  return { enabled: true, severity, options: entry.options ?? {} };
}

/**
 * 1 セグメント("/" を含まない)同士を照合する。"*" は "[^/]*"(スラッシュ以外の任意文字列)、
 * "?" は "[^/]"(スラッシュ以外の 1 文字)にマッチする。セグメントは "/" を含み得ないため、
 * 生成される正規表現は 1 パスコンポーネント長に有界でバックトラックも有界(ReDoS を起こさない)。
 */
function segmentMatches(pathSeg: string, patternSeg: string): boolean {
  let out = "^";
  for (const ch of patternSeg) {
    if (ch === "*") {
      out += "[^/]*";
    } else if (ch === "?") {
      out += "[^/]";
    } else if (/[.+^${}()|[\]\\]/.test(ch)) {
      out += `\\${ch}`;
    } else {
      out += ch;
    }
  }
  out += "$";
  return new RegExp(out).test(pathSeg);
}

/** 連続する "**" セグメントを 1 つに畳む(DP のサイズを縮める。正しさには必須ではない)。 */
function collapseDoubleStars(segments: string[]): string[] {
  const out: string[] = [];
  for (const seg of segments) {
    if (seg === "**" && out[out.length - 1] === "**") continue;
    out.push(seg);
  }
  return out;
}

/**
 * 簡易 glob マッチ。`**` は任意階層(0 階層含む)、`*` はパス区切り以外の任意文字列にマッチする。
 * 対象は POSIX 区切り(/)の相対パス。
 *
 * パターン・パスをともに "/" で分割し、セグメント単位の DP(動的計画法)で照合する
 * (パターン全体を 1 つの正規表現にコンパイルすることはしない)。
 * 旧実装は "**" を ".*" に変換して連結しており、ダブルスターの区切り("**" の直後に "/")が
 * 連続すると正規表現エンジンが指数的にバックトラックし得た(ReDoS)。DP は
 * O(パターン segment 数 × パス segment 数) で有界であり、この問題を起こさない。
 */
export function matchesIgnoreGlob(relPath: string, pattern: string): boolean {
  const patternSegs = collapseDoubleStars(pattern.split("/"));
  const pathSegs = relPath.split("/");
  const patLen = patternSegs.length;
  const pathLen = pathSegs.length;

  // dp[i][j] = patternSegs[i..] が pathSegs[j..] にマッチするか。
  const dp: boolean[][] = Array.from({ length: patLen + 1 }, () =>
    new Array<boolean>(pathLen + 1).fill(false),
  );
  dp[patLen][pathLen] = true;

  // i, j をともに末尾から埋める: dp[i][j] の計算に必要な dp[i+1][j] / dp[i][j+1] / dp[i+1][j+1] は
  // この順序であれば常に計算済みになっている。
  for (let i = patLen; i >= 0; i -= 1) {
    for (let j = pathLen; j >= 0; j -= 1) {
      if (i === patLen && j === pathLen) continue; // 上で設定済み
      if (i === patLen) {
        dp[i][j] = false; // パターンを使い切ったがパスセグメントが残っている
        continue;
      }
      const patSeg = patternSegs[i];
      if (patSeg === "**") {
        // "**" は 0 セグメントにマッチ(skip)するか、1 セグメント消費して同じ "**" に留まるか。
        const skip = dp[i + 1][j];
        const consumeOne = j < pathLen && dp[i][j + 1];
        dp[i][j] = skip || consumeOne;
        continue;
      }
      if (j === pathLen) {
        dp[i][j] = false; // パスセグメントを使い切ったが非 "**" パターンが残っている
        continue;
      }
      dp[i][j] = segmentMatches(pathSegs[j], patSeg) && dp[i + 1][j + 1];
    }
  }

  return dp[0][0];
}

/** ignore パターン一覧のいずれかにマッチするか判定する。 */
export function isIgnored(relPath: string, ignorePatterns: string[] | undefined): boolean {
  if (!ignorePatterns || ignorePatterns.length === 0) return false;
  return ignorePatterns.some((pattern) => matchesIgnoreGlob(relPath, pattern));
}
