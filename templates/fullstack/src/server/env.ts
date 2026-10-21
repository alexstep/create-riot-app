import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

const EnvSchema = z.object({
  SESSION_SECRET: z.string().min(16),
  DEMO_PASSWORD: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  PUBLIC_ORIGIN: z.string().url().optional(),
  DOCS_USER: z.string().min(1).optional(),
  DOCS_PASSWORD: z.string().min(1).optional(),
});

export type AppEnv = z.infer<typeof EnvSchema>;

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

export function parseEnv(source: NodeJS.ProcessEnv = process.env): AppEnv {
  if (source === process.env) loadDotEnv();
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'env'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment\n${details}`);
  }
  return parsed.data;
}
