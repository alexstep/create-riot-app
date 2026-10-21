#!/usr/bin/env bun

// Lint and format the <script> and <style> blocks of .riot files.
//
// Biome 2.6.2 ignores .riot, and feeding a tag to the HTML parser aborts.
// Stdin mode is not usable either: `biome lint --stdin-file-path` only prints
// "The contents aren't fixed" and does not emit rule diagnostics or JSON.
// Each block is written to a temp file named *.riot.ts or *.riot.css and
// checked with the Biome CLI. Markup is not formatted. An `each` without
// `key` is reported here because the Riot parser already sees those attributes.

import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import parser from '@riotjs/parser';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const biome = join(root, 'node_modules', '.bin', 'biome');
const configPath = join(root, 'biome.json');
const write = process.argv.includes('--write');

interface TextSpan {
  start: number;
  end: number;
  text: string;
}

interface TagLike {
  attributes?: { name: string; start: number }[];
  nodes?: unknown[];
  text?: TextSpan;
}

interface Diagnostic {
  file: string;
  line: number;
  column: number;
  severity: string;
  category: string;
  message: string;
}

const diagnostics: Diagnostic[] = [];

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function lineColumn(
  source: string,
  index: number,
): { line: number; column: number } {
  const line = source.slice(0, index).split('\n').length;
  const column = index - source.lastIndexOf('\n', Math.max(0, index - 1));
  return { line, column };
}

function riotFiles(dir: string, found: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name === '.git') continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) riotFiles(path, found);
    else if (name.endsWith('.riot')) found.push(path);
  }
  return found;
}

function attributeValue(
  source: string,
  attribute: { name: string; start: number },
): string {
  const slice = source.slice(attribute.start, attribute.start + 80);
  const match = slice.match(
    new RegExp(`^${attribute.name}\\s*=\\s*("([^"]*)"|'([^']*)'|\\S+)`),
  );
  return match?.[2] ?? match?.[3] ?? match?.[1] ?? '';
}

function blockKind(
  source: string,
  tag: TagLike,
  fallback: 'js' | 'css',
): 'ts' | 'js' | 'css' {
  if (fallback === 'css') return 'css';
  const lang = (tag.attributes ?? [])
    .map((attribute) => ({
      name: attribute.name,
      value: attributeValue(source, attribute),
    }))
    .find((attribute) => attribute.name === 'lang');
  if (lang?.value === 'ts' || lang?.value === 'typescript') return 'ts';
  return 'js';
}

function checkEachKeys(source: string, file: string, node: unknown): void {
  if (!node || typeof node !== 'object') return;
  const tag = node as TagLike & { nodes?: unknown[] };
  const attributes = tag.attributes ?? [];
  const each = attributes.find((attribute) => attribute.name === 'each');
  const key = attributes.find((attribute) => attribute.name === 'key');
  if (each && !key) {
    const position = lineColumn(source, each.start);
    diagnostics.push({
      file,
      line: position.line,
      column: position.column,
      severity: 'error',
      category: 'riot/each-key',
      message: '`each` is missing `key`.',
    });
  }
  for (const child of tag.nodes ?? []) checkEachKeys(source, file, child);
}

function indentOf(body: string): string {
  const indents = body
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => /^[ \t]*/.exec(line)?.[0] ?? '');
  if (indents.length === 0) return '';
  return indents.reduce((shortest, indent) =>
    indent.length < shortest.length ? indent : shortest,
  );
}

function dedent(body: string, indent: string): string {
  if (!indent) return body;
  return body
    .split('\n')
    .map((line) => (line.startsWith(indent) ? line.slice(indent.length) : line))
    .join('\n');
}

function indentText(text: string, indent: string): string {
  const trimmed = text.replace(/\n$/, '');
  if (!indent) return trimmed;
  return trimmed
    .split('\n')
    .map((line) => (line.length > 0 ? indent + line : line))
    .join('\n');
}

function runBiome(args: string[]): {
  status: number;
  stdout: string;
  stderr: string;
} {
  const [command, ...rest] = args;
  const result = spawnSync(
    biome,
    [command ?? 'lint', `--config-path=${configPath}`, ...rest],
    {
      encoding: 'utf8',
    },
  );
  if (result.error) fail(`Could not run Biome: ${result.error.message}`);
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function withTemp(
  kind: 'ts' | 'js' | 'css',
  code: string,
  run: (file: string) => void,
): void {
  const dir = mkdtempSync(join(tmpdir(), 'biome-riot-'));
  const file = join(dir, `block.riot.${kind}`);
  try {
    writeFileSync(file, code.endsWith('\n') ? code : `${code}\n`);
    run(file);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function lintCode(
  file: string,
  kind: 'ts' | 'js' | 'css',
  code: string,
  lineDelta: number,
  columnDelta: number,
): void {
  withTemp(kind, code, (temp) => {
    const result = runBiome(['lint', '--reporter=json', temp]);
    let parsed: {
      diagnostics?: {
        severity?: string;
        category?: string;
        message?: string;
        location?: { start?: { line?: number; column?: number } };
      }[];
    };
    try {
      parsed = JSON.parse(result.stdout) as typeof parsed;
    } catch {
      fail(
        `Biome did not return JSON for ${file}. Stdin mode is unusable in Biome 2.6.2, and the file reporter failed too.\n${result.stderr}`,
      );
    }
    for (const diagnostic of parsed.diagnostics ?? []) {
      const start = diagnostic.location?.start;
      const line = start?.line && start.line > 0 ? start.line : 1;
      const column = start?.column && start.column > 0 ? start.column : 1;
      diagnostics.push({
        file,
        line: line + lineDelta,
        column: column + columnDelta,
        severity: diagnostic.severity ?? 'error',
        category: diagnostic.category ?? 'lint',
        message: diagnostic.message ?? 'Biome diagnostic',
      });
    }
    if (result.status !== 0 && (parsed.diagnostics ?? []).length === 0) {
      fail(
        `Biome lint failed for ${file} without a diagnostic.\n${result.stderr}`,
      );
    }
  });
}

function formatCode(kind: 'ts' | 'js' | 'css', code: string): string {
  let formatted = code;
  withTemp(kind, code, (temp) => {
    const result = runBiome(['format', '--write', temp]);
    if (result.status !== 0) {
      fail(`Biome format failed.\n${result.stdout}\n${result.stderr}`);
    }
    formatted = readFileSync(temp, 'utf8').replace(/\n$/, '');
  });
  return formatted;
}

function splitInner(text: string): {
  prefix: string;
  body: string;
  suffix: string;
} {
  let prefix = '';
  let rest = text;
  if (rest.startsWith('\n')) {
    prefix = '\n';
    rest = rest.slice(1);
  }
  const suffixMatch = /\n[ \t]*$/.exec(rest);
  if (!suffixMatch) return { prefix, body: rest, suffix: '' };
  return {
    prefix,
    body: rest.slice(0, rest.length - suffixMatch[0].length),
    suffix: suffixMatch[0],
  };
}

function processFile(file: string): void {
  const source = readFileSync(file, 'utf8');
  let output: {
    javascript: TagLike | null;
    css: TagLike | null;
    template: unknown;
  };
  try {
    output = parser().parse(source).output as typeof output;
  } catch (error) {
    diagnostics.push({
      file,
      line: 1,
      column: 1,
      severity: 'error',
      category: 'riot/parse',
      message: error instanceof Error ? error.message : 'Riot parse failed',
    });
    return;
  }

  checkEachKeys(source, file, output.template);

  const pieces: { start: number; end: number; next: string }[] = [];
  for (const part of [
    { tag: output.javascript, fallback: 'js' as const },
    { tag: output.css, fallback: 'css' as const },
  ]) {
    const text = part.tag?.text;
    if (!text?.text.trim()) continue;
    const kind = blockKind(source, part.tag as TagLike, part.fallback);
    const { prefix, body, suffix } = splitInner(text.text);
    if (!body.trim()) continue;
    const indent = indentOf(body);
    const code = dedent(body, indent);
    const position = lineColumn(source, text.start + prefix.length);
    lintCode(file, kind, code, position.line - 1, indent.length);
    const formatted = formatCode(kind, code);
    const nextBody = indentText(formatted, indent);
    if (nextBody !== body) {
      if (!write) {
        diagnostics.push({
          file,
          line: position.line,
          column: position.column,
          severity: 'error',
          category: 'format',
          message:
            'Script or style block is not formatted. Run `bun run format`.',
        });
      } else {
        pieces.push({
          start: text.start,
          end: text.end,
          next: prefix + nextBody + suffix,
        });
      }
    }
  }

  if (!write || pieces.length === 0) return;
  let next = source;
  for (const piece of pieces.sort((a, b) => b.start - a.start)) {
    next = next.slice(0, piece.start) + piece.next + next.slice(piece.end);
  }
  if (next !== source) writeFileSync(file, next);
}

if (!statSync(biome, { throwIfNoEntry: false })) {
  fail(`Biome was not found at ${biome}. Run bun install.`);
}

for (const file of riotFiles(root)) processFile(file);

for (const diagnostic of diagnostics) {
  const where = `${relative(root, diagnostic.file)}:${diagnostic.line}:${diagnostic.column}`;
  console.error(`${where} ${diagnostic.category} ${diagnostic.message}`);
}

if (diagnostics.length > 0) process.exit(1);
