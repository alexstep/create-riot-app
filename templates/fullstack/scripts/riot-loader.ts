import { readFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { compile } from '@riotjs/compiler';
import { plugin } from 'bun';

plugin({
  name: 'riot',
  setup(build) {
    build.onResolve({ filter: /\.riot$/ }, (args) => {
      const from = args.importer
        ? dirname(args.importer)
        : args.resolveDir || process.cwd();
      const path = isAbsolute(args.path) ? args.path : resolve(from, args.path);
      return { path, namespace: 'riot' };
    });
    build.onLoad({ filter: /.*/, namespace: 'riot' }, (args) => {
      const result = compile(readFileSync(args.path, 'utf8'), {
        file: args.path,
      });
      return { contents: result.code, loader: 'ts' };
    });
  },
});
