import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

/** Dev-only cookie secret. Production never substitutes this. */
const DEV_SESSION_SECRET = 'dev-only-insecure-session-secret';
/** Dev-only login password. Production never substitutes this. */
const DEV_DEMO_PASSWORD = 'demo';

const SECRET_LINE = 'SESSION_SECRET — random string, at least 16 characters';
const SECRET_LENGTH_LINE = 'SESSION_SECRET — must be at least 16 characters';
const PASSWORD_LINE = 'DEMO_PASSWORD — password for the demo login';
const ORIGIN_LINE =
  'PUBLIC_ORIGIN — public site origin, for example https://example.com';
const ORIGIN_URL_LINE =
  'PUBLIC_ORIGIN — must be an absolute URL, for example https://example.com';

const EnvSchema = z
  .object({
    SESSION_SECRET: z.string(SECRET_LINE).min(16, SECRET_LENGTH_LINE),
    DEMO_PASSWORD: z.string(PASSWORD_LINE).min(1, PASSWORD_LINE),
    PORT: z.preprocess(
      (value) => (value === undefined || value === '' ? undefined : value),
      z.coerce
        .number({ error: 'PORT — a positive integer' })
        .int('PORT — a positive integer')
        .positive('PORT — a positive integer')
        .default(3000),
    ),
    NODE_ENV: z
      .enum(['development', 'production', 'test'], {
        error: 'NODE_ENV — development, production, or test',
      })
      .default('development'),
    PUBLIC_ORIGIN: z.string().url(ORIGIN_URL_LINE).optional(),
    DOCS_USER: z.string().min(1).optional(),
    DOCS_PASSWORD: z.string().min(1).optional(),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && !env.PUBLIC_ORIGIN) {
      ctx.addIssue({
        code: 'custom',
        path: ['PUBLIC_ORIGIN'],
        message: ORIGIN_LINE,
      });
    }
  });

export type AppEnv = z.infer<typeof EnvSchema>;

const announced = new Set<string>();

function loadDotEnv(): void {
  let text: string;
  try {
    text = readFileSync(resolve(process.cwd(), '.env'), 'utf8');
  } catch {
    return;
  }
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function blank(value: string | undefined): boolean {
  return value === undefined || value.trim() === '';
}

function normalize(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const next: NodeJS.ProcessEnv = { ...source };
  if (typeof next.NODE_ENV === 'string') {
    const trimmed = next.NODE_ENV.trim();
    if (trimmed === '') delete next.NODE_ENV;
    else next.NODE_ENV = trimmed;
  }
  for (const key of [
    'SESSION_SECRET',
    'DEMO_PASSWORD',
    'PUBLIC_ORIGIN',
    'DOCS_USER',
    'DOCS_PASSWORD',
    'PORT',
  ] as const) {
    if (blank(next[key])) delete next[key];
  }
  return next;
}

function productionProblems(source: NodeJS.ProcessEnv): string[] {
  const problems: string[] = [];
  if (blank(source.SESSION_SECRET)) problems.push(SECRET_LINE);
  else if ((source.SESSION_SECRET ?? '').length < 16) {
    problems.push(SECRET_LENGTH_LINE);
  }
  if (blank(source.DEMO_PASSWORD)) problems.push(PASSWORD_LINE);
  if (blank(source.PUBLIC_ORIGIN)) problems.push(ORIGIN_LINE);
  return problems;
}

function productionMessage(lines: string[]): string {
  return [
    'Cannot start in production. Set:',
    ...lines.map((line) => `  ${line}`),
    'Then start again. A new project already has these in .env.',
  ].join('\n');
}

function demoNotice(filled: string[]): string {
  const label =
    filled.length === 1
      ? filled[0]
      : `${filled.slice(0, -1).join(', ')} and ${filled.at(-1)}`;
  const password = filled.includes('DEMO_PASSWORD')
    ? ` The demo password is "${DEV_DEMO_PASSWORD}".`
    : '';
  return `Demo defaults are in use for ${label}.${password} Set real values in .env before deploying.`;
}

function announce(message: string, once: boolean): void {
  if (once) {
    if (announced.has(message)) return;
    announced.add(message);
  }
  console.log(message);
}

/**
 * Password to show on the login page. Production (including `bun run start`
 * and Docker) does not reveal it. Development and test do, so a first run
 * can sign in without reading `.env`.
 */
export function demoLoginPassword(env: AppEnv): string | null {
  if (env.NODE_ENV === 'production') return null;
  return env.DEMO_PASSWORD;
}

export function parseEnv(source: NodeJS.ProcessEnv = process.env): AppEnv {
  if (source === process.env) loadDotEnv();
  const next = normalize(source);
  const filled: string[] = [];
  // `bun run start` and the Docker image set NODE_ENV=production and must
  // not receive these insecure values. Development and test boot without a
  // .env file so the first `bun dev` is not an error overlay.
  if (next.NODE_ENV !== 'production') {
    if (!next.SESSION_SECRET) {
      next.SESSION_SECRET = DEV_SESSION_SECRET;
      filled.push('SESSION_SECRET');
    }
    if (!next.DEMO_PASSWORD) {
      next.DEMO_PASSWORD = DEV_DEMO_PASSWORD;
      filled.push('DEMO_PASSWORD');
    }
  } else {
    const problems = productionProblems(next);
    if (problems.length > 0) throw new Error(productionMessage(problems));
  }

  const parsed = EnvSchema.safeParse(next);
  if (!parsed.success) {
    const lines = parsed.error.issues.map(
      (issue) => issue.message || issue.path.join('.') || 'env',
    );
    if (next.NODE_ENV === 'production') {
      throw new Error(productionMessage(lines));
    }
    throw new Error(`Invalid environment\n${lines.join('\n')}`);
  }
  if (filled.length > 0) announce(demoNotice(filled), source === process.env);
  return parsed.data;
}
