import { describe, it, expect } from "vitest";
import { al006 } from "../../src/rules/al006-secret-pattern.js";
import { makeRuleContext } from "../helpers.js";
import type { FileContext } from "../../src/types.js";

// 疑似トークンは実行時に組み立てる(実トークン形式の文字列をリポジトリに
// コミットすると GitHub push protection に弾かれ得るため)。
function fakeToken(prefix: string, body: string, repeat: number): string {
  return prefix + body.repeat(repeat);
}

function claudeMd(content: string): FileContext {
  return { kind: "claude-md", relPath: "CLAUDE.md", absPath: "/tmp/x/CLAUDE.md", content };
}

describe("AL006 secret-pattern", () => {
  it("detects provider-specific tokens and masks them in the message", () => {
    const ghToken = fakeToken("ghp_", "a1B2c3D4e5F6", 3); // ghp_ + 36 chars
    const anthropicKey = fakeToken("sk-ant-", "k9J8h7G6", 3); // sk-ant- + 24 chars
    const content = `# Notes\n\ntoken: ${ghToken}\n\nkey: ${anthropicKey}\n`;
    const findings = al006.check(makeRuleContext(claudeMd(content)));
    expect(findings).toHaveLength(2);
    expect(findings[0]?.message).toContain("GitHub token");
    expect(findings[1]?.message).toContain("Anthropic API key");
    // メッセージにシークレット全体を含めない(先頭 10 文字 + … のみ)
    for (const f of findings) {
      expect(f.message).not.toContain(ghToken);
      expect(f.message).not.toContain(anthropicKey);
      expect(f.message).toContain("…");
    }
  });

  it("detects a private key block header", () => {
    const header = ["-----BEGIN", "RSA", "PRIVATE", "KEY-----"].join(" ");
    const findings = al006.check(makeRuleContext(claudeMd(`config:\n${header}\n`)));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.line).toBe(2);
    expect(findings[0]?.message).toContain("private key block");
  });

  it("stays silent on placeholders", () => {
    const placeholders = [
      fakeToken("ghp_", "x", 36), // 同一文字の繰り返し
      "sk-ant-YOUR-API-KEY-GOES-HERE",
      fakeToken("npm_", "X", 36),
    ].join("\n");
    const findings = al006.check(makeRuleContext(claudeMd(placeholders)));
    expect(findings).toHaveLength(0);
  });

  it("stays silent on ordinary prose and short lookalikes", () => {
    const content = "We use sk-ant-format keys and npm_config_registry settings in CI.\n";
    const findings = al006.check(makeRuleContext(claudeMd(content)));
    expect(findings).toHaveLength(0);
  });
});
