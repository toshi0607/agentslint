#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { discover, resolveRepoRoot } from "./discover.js";
import { loadConfig, resolveRuleConfig, isIgnored, ConfigError } from "./config.js";
import { parseMarkdown, parseFrontmatter } from "./parse/markdown.js";
import { rules } from "./rules/index.js";
import { formatPretty } from "./report/pretty.js";
import { formatJson } from "./report/json.js";
import { formatSarif } from "./report/sarif.js";
import { formatGithub } from "./report/github.js";
import type { FileContext, FileKind, Finding } from "./types.js";

type OutputFormat = "pretty" | "json" | "sarif" | "github";

interface ParsedArgs {
  paths: string[];
  format: OutputFormat;
  configPath?: string;
}

class CliUsageError extends Error {}

function parseArgs(argv: string[]): ParsedArgs {
  const paths: string[] = [];
  let format: OutputFormat = "pretty";
  let configPath: string | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--format") {
      const value = argv[i + 1];
      if (value !== "pretty" && value !== "json" && value !== "sarif" && value !== "github") {
        throw new CliUsageError(
          `--format は pretty|json|sarif|github のいずれかである必要があります: ${value ?? "(未指定)"}`,
        );
      }
      format = value;
      i += 1;
      continue;
    }
    if (arg === "--config") {
      const value = argv[i + 1];
      if (value === undefined) {
        throw new CliUsageError("--config には値が必要です");
      }
      configPath = value;
      i += 1;
      continue;
    }
    if (arg !== undefined) {
      paths.push(arg);
    }
  }

  return { paths, format, configPath };
}

/** ファイルを読み込み、種別に応じて FileContext を組み立てる。 */
async function buildFileContext(absPath: string, relPath: string, kind: FileKind): Promise<FileContext> {
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

async function main(): Promise<number> {
  const cwd = process.cwd();
  let args: ParsedArgs;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    if (err instanceof CliUsageError) {
      process.stderr.write(`${err.message}\n`);
      return 2;
    }
    throw err;
  }

  let config;
  try {
    config = await loadConfig(cwd, args.configPath);
  } catch (err) {
    if (err instanceof ConfigError) {
      process.stderr.write(`${err.message}\n`);
      return 2;
    }
    throw err;
  }

  const searchRoots = args.paths.length > 0 ? args.paths.map((p) => path.resolve(cwd, p)) : [cwd];

  const discoveredByAbsPath = new Map<string, { relPath: string; absPath: string; kind: FileKind }>();
  for (const root of searchRoots) {
    const found = await discover(root);
    for (const file of found) {
      // relPath は各 discover 呼び出しの root からの相対パスなので、
      // 最終的な報告用の相対パスは cwd 基準に統一する。
      const relFromCwd = path.relative(cwd, file.absPath).split(path.sep).join("/");
      discoveredByAbsPath.set(file.absPath, { relPath: relFromCwd, absPath: file.absPath, kind: file.kind });
    }
  }

  const afterIgnore = [...discoveredByAbsPath.values()].filter(
    (file) => !isIgnored(file.relPath, config.ignore),
  );

  if (afterIgnore.length === 0) {
    if (args.format === "pretty") {
      process.stderr.write(
        "対象ファイルなし。AGENTS.md / CLAUDE.md / .claude/ を探索したが見つからなかった\n",
      );
      return 0;
    }
    if (args.format === "json") {
      process.stdout.write(`${formatJson([], 0)}\n`);
      return 0;
    }
    if (args.format === "github") {
      process.stdout.write(`${formatGithub([], 0)}\n`);
      return 0;
    }
    process.stdout.write(`${formatSarif([])}\n`);
    return 0;
  }

  const fileContexts = await Promise.all(
    afterIgnore.map((file) => buildFileContext(file.absPath, file.relPath, file.kind)),
  );

  const repoRoot = await resolveRepoRoot(cwd);

  const allFindings: Finding[] = [];
  for (const fileCtx of fileContexts) {
    for (const rule of rules) {
      if (!rule.appliesTo.includes(fileCtx.kind)) continue;
      const resolved = resolveRuleConfig(rule.id, rule.defaultSeverity, config);
      if (!resolved.enabled) continue;
      const findings = rule.check({
        file: fileCtx,
        config: resolved,
        allFiles: fileContexts,
        rootDir: repoRoot,
      });
      allFindings.push(...findings);
    }
  }

  const filesScanned = fileContexts.length;

  if (args.format === "json") {
    process.stdout.write(`${formatJson(allFindings, filesScanned)}\n`);
  } else if (args.format === "sarif") {
    process.stdout.write(`${formatSarif(allFindings)}\n`);
  } else if (args.format === "github") {
    process.stdout.write(`${formatGithub(allFindings, filesScanned)}\n`);
  } else {
    const useColor = process.stdout.isTTY === true;
    process.stdout.write(`${formatPretty(allFindings, filesScanned, useColor)}\n`);
  }

  const hasError = allFindings.some((finding) => finding.severity === "error");
  return hasError ? 1 : 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err: unknown) => {
    process.stderr.write(`内部エラー: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 2;
  });
