// Prettier has no Riot parser. The HTML parser splits unquoted attributes on
// spaces and quotes, so `each={item in items}` and `class={'a' + b}` do not
// survive. This plugin masks template expressions, formats the file as HTML
// (which also formats `<script lang="ts">` and `<style>`), then puts the
// expressions back.

import parser from '@riotjs/parser';
import * as prettier from 'prettier';

const TOKEN = /__RIOT_EXPR_(\d+)__/g;

function collectExpressions(node, found) {
  if (!node) return;
  for (const attribute of node.attributes || []) {
    for (const expression of attribute.expressions || [])
      found.push(expression);
  }
  for (const expression of node.expressions || []) found.push(expression);
  for (const child of node.nodes || []) collectExpressions(child, found);
}

function maskExpressions(source) {
  const { output } = parser().parse(source);
  const ranges = [];
  collectExpressions(output.template, ranges);
  ranges.sort((a, b) => a.start - b.start);
  const originals = ranges.map((expression) =>
    source.slice(expression.start, expression.end),
  );
  let masked = source;
  for (let index = ranges.length - 1; index >= 0; index -= 1) {
    const expression = ranges[index];
    masked = `${masked.slice(0, expression.start)}__RIOT_EXPR_${index}__${masked.slice(expression.end)}`;
  }
  return { masked, originals };
}

function restoreExpressions(formatted, originals) {
  return formatted.replace(TOKEN, (token, index) => {
    const original = originals[Number(index)];
    if (original == null) {
      throw new Error(`Prettier lost Riot expression placeholder ${token}`);
    }
    return original;
  });
}

function htmlOptions(options) {
  return {
    parser: 'html',
    plugins: [],
    singleQuote: options.singleQuote,
    semi: options.semi,
    trailingComma: options.trailingComma,
    printWidth: options.printWidth,
    tabWidth: options.tabWidth,
    useTabs: options.useTabs,
    htmlWhitespaceSensitivity: options.htmlWhitespaceSensitivity ?? 'strict',
    embeddedLanguageFormatting: options.embeddedLanguageFormatting ?? 'auto',
    bracketSameLine: options.bracketSameLine,
    endOfLine: options.endOfLine ?? 'lf',
  };
}

async function formatRiot(source, options) {
  const { masked, originals } = maskExpressions(source);
  const formatted = await prettier.format(masked, htmlOptions(options));
  const restored = restoreExpressions(formatted, originals);
  if (restored.includes('__RIOT_EXPR_')) {
    throw new Error('Prettier split a Riot expression placeholder');
  }
  return restored;
}

export const languages = [
  {
    name: 'Riot',
    parsers: ['riot'],
    extensions: ['.riot'],
    vscodeLanguageIds: ['riot'],
  },
];

export const parsers = {
  riot: {
    astFormat: 'riot',
    locStart: () => 0,
    locEnd: (node) => node.formatted.length,
    async parse(text, options) {
      return { formatted: await formatRiot(text, options) };
    },
  },
};

export const printers = {
  riot: {
    print(path) {
      return path.getValue().formatted;
    },
  },
};
