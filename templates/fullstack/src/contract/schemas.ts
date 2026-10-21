import { z } from '@hono/zod-openapi';

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

export const ErrorBodySchema = z
  .object({
    error: z.string(),
    fields: z.record(z.string(), z.array(z.string())).optional(),
  })
  .openapi('ErrorBody');

export const UserSchema = z
  .object({
    id: z.string(),
  })
  .openapi('User');

export const SessionSchema = z
  .object({
    user: UserSchema,
  })
  .openapi('Session');

export const ProfileInputSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(80),
    email: z.string().trim().email('Enter a valid email').max(120),
    message: z.string().trim().min(1, 'Message is required').max(500),
  })
  .openapi('ProfileInput');

export const ProfileSchema = ProfileInputSchema.extend({
  updatedAt: z.number().int(),
  version: z.number().int(),
}).openapi('Profile');

export const FileMetaSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    type: z.string(),
    size: z.number().int().nonnegative(),
    createdAt: z.number().int(),
  })
  .openapi('FileMeta');

export const FileListSchema = z
  .object({
    files: z.array(FileMetaSchema),
    version: z.number().int(),
  })
  .openapi('FileList');

const FilePartSchema = z
  .instanceof(File)
  .refine((file) => file.size > 0, 'File is empty')
  .refine((file) => file.size <= MAX_FILE_BYTES, 'File exceeds 256 KB')
  .refine(
    (file) =>
      (ALLOWED_TYPES as readonly string[]).includes(mediaType(file.type)),
    'Unsupported file type',
  )
  .openapi({ type: 'string', format: 'binary' });

/**
 * One part arrives as a File. Two or more parts with the same name arrive as
 * File[]. Hono's form parser does that itself. Normalize to an array so the
 * handler has one shape, and document the field as a binary array.
 */
export const UploadFormSchema = z
  .object({
    files: z.preprocess(
      (value) => {
        if (value == null) return [];
        return Array.isArray(value) ? value : [value];
      },
      z
        .array(FilePartSchema)
        .min(1, 'Choose at least one file')
        .max(MAX_FILES, 'Too many files'),
    ),
  })
  .openapi('UploadForm');

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
export type UploadForm = z.infer<typeof UploadFormSchema>;

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
