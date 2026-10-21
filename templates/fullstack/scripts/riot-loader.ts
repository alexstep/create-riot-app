import { readFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { compile } from '@riotjs/compiler';
import { plugin } from 'bun';

// Bun's transpiler cache is content-addressed. Specifiers in this output stay
// project-relative (`riot:src/...`, `riot-file:src/...`) so a new directory
// does not bake in another absolute path. Entries already written by older
// releases still contain absolute paths; `bun run test` points
// BUN_RUNTIME_TRANSPILER_CACHE_PATH at node_modules/.cache so those entries
// are never opened.
//
// Dev and production builds do not use this file. Vite compiles tags with
// `riot-plugin.ts`. This plugin is the `[test] preload` in bunfig.toml.

const fileNamespace = 'riot-file';

function projectPath(absolute: string): string {
  const rel = relative(process.cwd(), absolute);
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) return absolute;
  return rel.split(sep).join('/');
}

function toAbsolute(specifier: string): string {
  const bare = specifier.replace(/^(?:riot-file|riot):/, '');
  return isAbsolute(bare) ? bare : resolve(process.cwd(), bare);
}

function importerDir(importer: string, resolveDir: string): string {
  if (!importer) return resolveDir || process.cwd();
  return dirname(toAbsolute(importer));
}

function rewriteImports(code: string, fileRelative: string): string {
  const dir = dirname(fileRelative);
  return code.replace(
    /(from\s+|import\s*\(\s*|import\s+)(['"])(\.[^'"]+)\2/g,
    (_match, prefix: string, quote: string, spec: string) => {
      const target = projectPath(resolve(process.cwd(), dir, spec));
      const namespace = spec.endsWith('.riot') ? 'riot' : fileNamespace;
      return `${prefix}${quote}${namespace}:${target}${quote}`;
    },
  );
}

plugin({
  name: 'riot',
  setup(build) {
    build.onResolve({ filter: /\.riot$/ }, (args) => {
      const from = importerDir(args.importer, args.resolveDir);
      const file = isAbsolute(args.path) ? args.path : resolve(from, args.path);
      return { path: projectPath(file), namespace: 'riot' };
    });

    build.onResolve({ filter: /.*/, namespace: fileNamespace }, (args) => {
      if (args.path.endsWith('.riot')) {
        return { path: projectPath(toAbsolute(args.path)), namespace: 'riot' };
      }
      return { path: toAbsolute(args.path) };
    });

    build.onLoad({ filter: /.*/, namespace: 'riot' }, (args) => {
      const file = toAbsolute(args.path);
      const relativeFile = projectPath(file);
      const source = compile(readFileSync(file, 'utf8'), {
        file: relativeFile,
      });
      return {
        contents: rewriteImports(source.code, relativeFile),
        loader: 'ts',
      };
    });
  },
});
