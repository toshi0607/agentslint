import { unified } from "unified";
import remarkParse from "remark-parse";
import { parse as parseYaml } from "yaml";
import type { Root, RootContent } from "mdast";
import type { FrontmatterResult } from "../types.js";

/** unist ノード共通の最小形。手書き visitor で使う。 */
interface UnistNodeLike {
  type: string;
  children?: UnistNodeLike[];
  position?: {
    start: { line: number; column: number; offset?: number };
    end: { line: number; column: number; offset?: number };
  };
  [key: string]: unknown;
}

const processor = unified().use(remarkParse);

/** markdown 文字列を mdast にパースする。 */
export function parseMarkdown(content: string): Root {
  return processor.parse(content) as Root;
}

/**
 * mdast を深さ優先で走査し、type が一致するノードを順に yield する。
 * unist-util-visit は依存に追加しないため、手書きの最小 visitor で代替する
 * (許可された依存は unified / remark-parse / yaml のみ)。
 */
export function* visit<T extends UnistNodeLike = UnistNodeLike>(
  tree: Root | RootContent,
  type: string,
): Generator<T> {
  const node = tree as unknown as UnistNodeLike;
  if (node.type === type) {
    yield node as T;
  }
  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      yield* visit<T>(child as unknown as RootContent, type);
    }
  }
}

export interface MdLink {
  url: string;
  line: number;
}

/**
 * mdast から link ノードと definition ノード(参照スタイルリンクの定義 `[ref]: ./x.md`)を
 * 全て抽出する(コードフェンス内には link/definition ノードは出現しない)。
 * definition の url も link と同じ形(url, line)で返すことで、呼び出し側は既存の
 * URL/アンカー/スキップ規則をそのまま共通適用できる。
 */
export function extractLinks(tree: Root): MdLink[] {
  const links: MdLink[] = [];
  for (const node of visit(tree, "link")) {
    const url = (node as unknown as { url?: string }).url;
    if (typeof url === "string") {
      links.push({ url, line: node.position?.start.line ?? 1 });
    }
  }
  for (const node of visit(tree, "definition")) {
    const url = (node as unknown as { url?: string }).url;
    if (typeof url === "string") {
      links.push({ url, line: node.position?.start.line ?? 1 });
    }
  }
  return links;
}

export interface MdCodeBlock {
  lang: string | null;
  value: string;
  line: number;
}

/** フェンスコードブロック(``` ... ```)を全て抽出する。 */
export function extractCodeBlocks(tree: Root): MdCodeBlock[] {
  const blocks: MdCodeBlock[] = [];
  for (const node of visit(tree, "code")) {
    const value = (node as unknown as { value?: string }).value ?? "";
    const lang = (node as unknown as { lang?: string | null }).lang ?? null;
    blocks.push({ lang, value, line: node.position?.start.line ?? 1 });
  }
  return blocks;
}

export interface MdInlineCode {
  value: string;
  line: number;
}

/** インラインコード(`...`)を全て抽出する。 */
export function extractInlineCode(tree: Root): MdInlineCode[] {
  const spans: MdInlineCode[] = [];
  for (const node of visit(tree, "inlineCode")) {
    const value = (node as unknown as { value?: string }).value ?? "";
    spans.push({ value, line: node.position?.start.line ?? 1 });
  }
  return spans;
}

export interface MdTextSpan {
  value: string;
  line: number;
}

/**
 * コードフェンス・インラインコードの外側にあるプレーンテキストを全て抽出する。
 * mdast の text ノードは元々コードブロック内には出現しないため、
 * text ノードだけを対象にすれば自然に「コードブロック外」の条件を満たす。
 */
export function extractPlainText(tree: Root): MdTextSpan[] {
  const spans: MdTextSpan[] = [];
  for (const node of visit(tree, "text")) {
    const value = (node as unknown as { value?: string }).value ?? "";
    spans.push({ value, line: node.position?.start.line ?? 1 });
  }
  return spans;
}

/**
 * text ノード内の offset(0 始まり、value 内でのインデックス)から、
 * ファイル全体基準の実際の行番号を計算する。
 * text ノードは複数行にまたがることがある(段落の折り返しなど)ため、
 * ノード開始行 + そこまでの改行数で補正する。
 */
export function resolveLineInSpan(span: MdTextSpan, offsetInValue: number): number {
  const before = span.value.slice(0, offsetInValue);
  const newlines = (before.match(/\n/g) ?? []).length;
  return span.line + newlines;
}

// ファイル先頭の "---" フロントマターブロックを検出する正規表現。
// remark-parse は remark-frontmatter プラグインなしでは "---" を正しく解釈できない
// (setext heading の underline 等に誤解釈される)ため、フロントマターは raw content
// の文字列処理で抽出し、yaml パッケージで直接パースする。
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/**
 * ファイル先頭の YAML frontmatter(--- ... ---)を抽出・パースする。
 * frontmatter が存在しない場合は present: false を返す。
 */
export function parseFrontmatter(content: string): FrontmatterResult {
  const match = content.match(FRONTMATTER_RE);
  if (!match) {
    return { present: false, blockLineCount: 0 };
  }

  const yamlBody = match[1] ?? "";
  const blockText = match[0];
  const blockLineCount = (blockText.match(/\n/g) ?? []).length;

  try {
    const data = parseYaml(yamlBody);
    if (data === null || data === undefined) {
      return { present: true, data: {}, blockLineCount };
    }
    if (typeof data !== "object" || Array.isArray(data)) {
      return {
        present: true,
        blockLineCount,
        error: new Error("frontmatter は YAML マッピング(key: value)である必要があります"),
      };
    }
    return { present: true, data: data as Record<string, unknown>, blockLineCount };
  } catch (err) {
    return { present: true, blockLineCount, error: err as Error };
  }
}
