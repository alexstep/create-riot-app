// ESLint has no Riot language. @riotjs/parser extracts `<script lang="ts">`
// and this processor asks ESLint to lint that text as TypeScript. Message
// lines are shifted so they point at the .riot file.
//
// Template expressions (`each`, `if`, `is`, `{...}`) are not linted. A useful
// undefined-identifier check needs the component scope (`state`, `props`,
// methods, and loop variables). That is a second compiler, so it is skipped.

import parser from '@riotjs/parser';

const extractedByFile = new Map();

function lineOf(source, index) {
  return source.slice(0, index).split('\n').length;
}

function columnOf(source, index) {
  return index - source.lastIndexOf('\n', index - 1);
}

function extractScript(source) {
  let output;
  try {
    output = parser().parse(source).output;
  } catch (error) {
    const failure = new Error(
      error instanceof Error ? error.message : 'Riot parse failed',
    );
    failure.lineNumber = 1;
    failure.column = 1;
    throw failure;
  }

  const textNode = output.javascript?.text;
  if (!textNode?.text?.trim()) return null;

  let code = textNode.text;
  let start = textNode.start;
  if (code.startsWith('\n')) {
    code = code.slice(1);
    start += 1;
  }
  if (code.endsWith('\n')) code = code.slice(0, -1);

  return {
    code,
    lineDelta: lineOf(source, start) - 1,
    columnDelta: columnOf(source, start) - 1,
  };
}

const processor = {
  meta: {
    name: 'riot-script',
    version: '1.0.0',
  },
  supportsAutofix: false,
  preprocess(text, filename) {
    const extracted = extractScript(text);
    if (!extracted) {
      extractedByFile.delete(filename);
      return [];
    }
    extractedByFile.set(filename, extracted);
    return [{ text: extracted.code, filename: 'script.ts' }];
  },
  postprocess(messages, filename) {
    const extracted = extractedByFile.get(filename);
    const flat = messages.flat();
    if (!extracted) return flat;
    return flat.map((message) => ({
      ...message,
      line: (message.line ?? 1) + extracted.lineDelta,
      endLine:
        message.endLine == null
          ? message.endLine
          : message.endLine + extracted.lineDelta,
      column: (message.column ?? 1) + extracted.columnDelta,
      endColumn:
        message.endColumn == null
          ? message.endColumn
          : message.endColumn + extracted.columnDelta,
    }));
  },
};

export default processor;
