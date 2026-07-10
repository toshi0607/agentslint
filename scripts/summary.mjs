// GitHub Actions の Job Summary に findings の表を書き出す。
// 使い方: node scripts/summary.mjs <agentslint --format json の出力ファイル>
import { readFileSync, appendFileSync } from "node:fs";

const reportPath = process.argv[2];
const summaryPath = process.env.GITHUB_STEP_SUMMARY;
if (!reportPath || !summaryPath) process.exit(0);

const report = JSON.parse(readFileSync(reportPath, "utf8"));
const { errors, warnings, info, filesScanned } = report.summary;

let md = `## agentslint\n\n**${errors} errors, ${warnings} warnings, ${info} info** / ${filesScanned} files scanned\n\n`;
if (report.findings.length > 0) {
  md += "| File | Line | Severity | Rule | Message |\n|---|---|---|---|---|\n";
  for (const f of report.findings) {
    md += `| ${f.file} | ${f.line} | ${f.severity} | ${f.ruleId} | ${f.message.replaceAll("|", "\\|")} |\n`;
  }
} else {
  md += "No findings.\n";
}
appendFileSync(summaryPath, `${md}\n`);
