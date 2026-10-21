import * as riot from './prettier.riot-plugin.js';

// `.riot` uses the local plugin, not Prettier's HTML parser. The HTML parser
// splits `each={item in items}` on spaces and rejects quotes inside `class={...}`.
// `htmlWhitespaceSensitivity: "strict"` keeps text nodes from being rewritten
// more than tag wrapping requires.

/** @type {import('prettier').Config} */
const config = {
  singleQuote: true,
  semi: true,
  trailingComma: 'all',
  htmlWhitespaceSensitivity: 'strict',
  plugins: [riot],
  overrides: [
    {
      files: '*.riot',
      options: {
        parser: 'riot',
      },
    },
  ],
};

export default config;
