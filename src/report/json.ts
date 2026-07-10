import type { Finding } from "../types.js";

export interface Summary {
  errors: number;
  warnings: number;
  info: number;
  filesScanned: number;
}

export interface JsonReport {
  findings: Finding[];
  summary: Summary;
}

export function computeSummary(findings: Finding[], filesScanned: number): Summary {
  let errors = 0;
  let warnings = 0;
  let info = 0;
  for (const finding of findings) {
    if (finding.severity === "error") errors += 1;
    else if (finding.severity === "warn") warnings += 1;
    else info += 1;
  }
  return { errors, warnings, info, filesScanned };
}

/** findings を JSON 形式でフォーマットする: {findings: [...], summary: {...}} */
export function formatJson(findings: Finding[], filesScanned: number): string {
  const report: JsonReport = {
    findings,
    summary: computeSummary(findings, filesScanned),
  };
  return JSON.stringify(report, null, 2);
}
