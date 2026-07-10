import type { Finding } from "../types.js";
import { computeSummary } from "./json.js";

/**
 * GitHub Actions ワークフローコマンドのメッセージ部エスケープ。
 * https://docs.github.com/actions/reference/workflow-commands-for-github-actions
 */
function escapeData(value: string): string {
  return value.replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A");
}

/** プロパティ部(file= 等)は "," と ":" も追加でエスケープする。 */
function escapeProperty(value: string): string {
  return escapeData(value).replaceAll(",", "%2C").replaceAll(":", "%3A");
}

const SEVERITY_TO_COMMAND = {
  error: "error",
  warn: "warning",
  info: "notice",
} as const;

/**
 * findings を GitHub Actions のワークフローコマンド(::error file=...)としてフォーマットする。
 * PR の Files changed 上にインラインアノテーションとして表示される。
 */
export function formatGithub(findings: Finding[], filesScanned: number): string {
  const lines = findings.map((finding) => {
    const command = SEVERITY_TO_COMMAND[finding.severity];
    const props = `file=${escapeProperty(finding.file)},line=${String(finding.line)},title=${escapeProperty(
      `agentslint ${finding.ruleId}`,
    )}`;
    return `::${command} ${props}::${escapeData(finding.message)}`;
  });

  const summary = computeSummary(findings, filesScanned);
  lines.push(
    `${String(summary.errors)} errors, ${String(summary.warnings)} warnings, ${String(summary.info)} info / ${String(summary.filesScanned)} files scanned`,
  );
  return lines.join("\n");
}
