import type { Finding, Rule, RuleContext } from "../types.js";

const RULE_ID = "AL006";
const RULE_NAME = "secret-pattern";

/**
 * 確度の高いプロバイダ固有パターンのみを対象にする(誤検知ゼロ優先)。
 * 汎用の高エントロピー検知は入れない。
 */
interface SecretPattern {
  name: string;
  re: RegExp;
}

const PATTERNS: SecretPattern[] = [
  { name: "Anthropic API key", re: /\bsk-ant-[A-Za-z0-9_-]{20,}/g },
  { name: "OpenAI API key", re: /\bsk-proj-[A-Za-z0-9_-]{20,}/g },
  { name: "GitHub token", re: /\bgh[pousr]_[A-Za-z0-9]{36,}/g },
  { name: "GitHub fine-grained token", re: /\bgithub_pat_[A-Za-z0-9_]{22,}/g },
  { name: "AWS access key ID", re: /\b(?:AKIA|ASIA|ABIA|ACCA)[A-Z0-9]{16}\b/g },
  { name: "Slack token", re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/g },
  { name: "Google API key", re: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { name: "npm token", re: /\bnpm_[A-Za-z0-9]{36,}\b/g },
  { name: "private key block", re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/g },
];

/**
 * プレースホルダらしきトークンは検知しない:
 * 同一文字の 8 連続、"xxxx"、your/example/placeholder/dummy/redacted/changeme を含むもの。
 */
function looksLikePlaceholder(token: string): boolean {
  if (/(.)\1{7,}/.test(token)) return true;
  if (/xxxx/i.test(token)) return true;
  if (/your|example|placeholder|dummy|redacted|changeme/i.test(token)) return true;
  return false;
}

/** 秘密情報そのものを finding メッセージに含めないため、先頭 10 文字だけ残してマスクする。 */
function mask(token: string): string {
  return token.length <= 10 ? token : `${token.slice(0, 10)}…`;
}

export const al006: Rule = {
  id: RULE_ID,
  name: RULE_NAME,
  defaultSeverity: "error",
  appliesTo: ["agents-md", "claude-md", "skill", "settings"],
  check(ctx: RuleContext): Finding[] {
    const { file, config } = ctx;
    const findings: Finding[] = [];

    // コードフェンス内も含めて raw content 全体を走査する
    // (フェンス内に書かれたシークレットも漏えいであることに変わりはない)。
    const lines = file.content.split(/\r?\n/);
    lines.forEach((lineText, idx) => {
      for (const pattern of PATTERNS) {
        for (const match of lineText.matchAll(pattern.re)) {
          const token = match[0];
          if (looksLikePlaceholder(token)) continue;
          findings.push({
            ruleId: RULE_ID,
            ruleName: RULE_NAME,
            severity: config.severity,
            file: file.relPath,
            line: idx + 1,
            message: `Possible ${pattern.name} detected: "${mask(token)}"`,
          });
        }
      }
    });

    return findings;
  },
};
