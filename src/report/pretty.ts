import type { Finding, Severity } from "../types.js";
import { computeSummary } from "./json.js";

const ANSI = {
  reset: "[0m",
  bold: "[1m",
  red: "[31m",
  yellow: "[33m",
  cyan: "[36m",
  gray: "[90m",
};

function colorFor(severity: Severity): string {
  if (severity === "error") return ANSI.red;
  if (severity === "warn") return ANSI.yellow;
  return ANSI.cyan;
}

function paint(text: string, code: string, useColor: boolean): string {
  return useColor ? `${code}${text}${ANSI.reset}` : text;
}

/**
 * findings を pretty 形式でフォーマットする。
 * ファイルごとにグループ化し `<line>:<severity> <ruleId> <message>`、
 * 末尾に合計行(x errors, y warnings, z info / N files scanned)。
 * @param useColor TTY のときのみ true にして呼び出す(生 ANSI エスケープ、依存追加なし)。
 */
export function formatPretty(findings: Finding[], filesScanned: number, useColor: boolean): string {
  const lines: string[] = [];

  if (findings.length === 0) {
    lines.push(paint("findings は 0 件です", ANSI.bold, useColor));
  } else {
    const byFile = new Map<string, Finding[]>();
    for (const finding of findings) {
      const list = byFile.get(finding.file) ?? [];
      list.push(finding);
      byFile.set(finding.file, list);
    }

    const files = [...byFile.keys()].sort();
    for (const file of files) {
      lines.push(paint(file, ANSI.bold, useColor));
      const fileFindings = [...(byFile.get(file) ?? [])].sort((a, b) => a.line - b.line);
      for (const finding of fileFindings) {
        const severityLabel = paint(finding.severity, colorFor(finding.severity), useColor);
        const ruleLabel = paint(finding.ruleId, ANSI.gray, useColor);
        lines.push(`  ${finding.line}:${severityLabel} ${ruleLabel} ${finding.message}`);
      }
      lines.push("");
    }
  }

  const summary = computeSummary(findings, filesScanned);
  lines.push(
    `${summary.errors} errors, ${summary.warnings} warnings, ${summary.info} info / ${filesScanned} files scanned`,
  );

  return lines.join("\n");
}
