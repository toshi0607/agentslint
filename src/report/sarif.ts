import type { Finding, Severity } from "../types.js";
import { rules as allRules } from "../rules/index.js";

type SarifLevel = "error" | "warning" | "note";

function toSarifLevel(severity: Severity): SarifLevel {
  if (severity === "error") return "error";
  if (severity === "warn") return "warning";
  return "note";
}

/** findings を SARIF 2.1.0 の最小構成でフォーマットする。 */
export function formatSarif(findings: Finding[]): string {
  const sarif = {
    $schema: "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "agentslint",
            informationUri: "https://github.com/toshi0607/agentslint",
            rules: allRules.map((rule) => ({
              id: rule.id,
              name: rule.name,
              shortDescription: {
                text: rule.name,
              },
              defaultConfiguration: {
                level: toSarifLevel(rule.defaultSeverity),
              },
            })),
          },
        },
        results: findings.map((finding) => ({
          ruleId: finding.ruleId,
          level: toSarifLevel(finding.severity),
          message: {
            text: finding.message,
          },
          locations: [
            {
              physicalLocation: {
                artifactLocation: {
                  uri: finding.file,
                },
                region: {
                  startLine: finding.line,
                },
              },
            },
          ],
        })),
      },
    ],
  };

  return JSON.stringify(sarif, null, 2);
}
