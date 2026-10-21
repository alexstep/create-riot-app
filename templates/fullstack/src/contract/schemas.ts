import { z } from 'zod';

/** Per-file cap. The route also sets a body limit that includes multipart overhead. */
export const MAX_FILE_BYTES = 256 * 1024;
export const MAX_FILES = 5;
export const MAX_BODY_BYTES = 2 * 1024 * 1024;

export const ALLOWED_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'text/plain',
  'application/pdf',
] as const;

export type AllowedType = (typeof ALLOWED_TYPES)[number];

export const ErrorBodySchema = z.object({
  error: z.string(),
  fields: z.record(z.string(), z.array(z.string())).optional(),
});

export const UserSchema = z.object({
  id: z.string(),
});

export const SessionSchema = z.object({
  user: UserSchema,
});

export const ProfileInputSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(80),
  email: z.string().trim().email('Enter a valid email').max(120),
  message: z.string().trim().min(1, 'Message is required').max(500),
});

export const ProfileSchema = ProfileInputSchema.extend({
  updatedAt: z.number().int(),
  version: z.number().int(),
});

export const FileMetaSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  type: z.string(),
  size: z.number().int().nonnegative(),
  createdAt: z.number().int(),
});

export const FileListSchema = z.object({
  files: z.array(FileMetaSchema),
  version: z.number().int(),
});

export const LiveEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('profile'),
    version: z.number().int(),
    profile: ProfileSchema,
  }),
  z.object({
    type: z.literal('uploads'),
    version: z.number().int(),
    files: z.array(FileMetaSchema),
  }),
  z.object({
    type: z.literal('invalidate'),
    version: z.number().int(),
    topics: z.array(z.enum(['profile', 'uploads'])),
  }),
  z.object({
    type: z.literal('resync'),
    version: z.number().int(),
  }),
]);

export type ErrorBody = z.infer<typeof ErrorBodySchema>;
export type User = z.infer<typeof UserSchema>;
export type ProfileInput = z.infer<typeof ProfileInputSchema>;
export type Profile = z.infer<typeof ProfileSchema>;
export type FileMeta = z.infer<typeof FileMetaSchema>;
export type FileList = z.infer<typeof FileListSchema>;
export type LiveEvent = z.infer<typeof LiveEventSchema>;

/** `text/plain;charset=utf-8` (Bun's multipart parser) is the same type as `text/plain`. */
export function mediaType(type: string): string {
  return type.split(';', 1)[0]?.trim().toLowerCase() ?? '';
}

export function fieldErrors(error: z.ZodError): Record<string, string[]> {
  const fields: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const parts = issue.path.map(String);
    const key = (parts[0] ?? '_') || '_';
    const list = fields[key] ?? [];
    list.push(issue.message);
    fields[key] = list;
  }
  return fields;
}

export function errorBody(error: z.ZodError): ErrorBody {
  return {
    error: error.issues[0]?.message ?? 'Validation error',
    fields: fieldErrors(error),
  };
}
