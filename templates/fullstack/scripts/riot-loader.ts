import { readFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { compile } from '@riotjs/compiler';
import { plugin } from 'bun';

// Bun loads a compiled tag as `riot:/absolute/path` and does not resolve
// relative imports from that URL. Rewrite them to absolute paths first.
function rewriteRelativeImports(code: string, dir: string): string {
  return code.replace(
    /(from\s+|import\s*\(\s*|import\s+)(['"])(\.[^'"]+)\2/g,
    (_match, prefix: string, quote: string, spec: string) => {
      const path = resolve(dir, spec);
      return `${prefix}${quote}${path}${quote}`;
    },
  );
}

plugin({
  name: 'riot',
  setup(build) {
    build.onResolve({ filter: /\.riot$/ }, (args) => {
      const from = args.importer
        ? dirname(args.importer.replace(/^riot:/, ''))
        : args.resolveDir || process.cwd();
      const path = isAbsolute(args.path) ? args.path : resolve(from, args.path);
      return { path, namespace: 'riot' };
    });
    build.onLoad({ filter: /.*/, namespace: 'riot' }, (args) => {
      const result = compile(readFileSync(args.path, 'utf8'), {
        file: args.path,
      });
      return {
        contents: rewriteRelativeImports(result.code, dirname(args.path)),
        loader: 'ts',
      };
    });
  },
});
