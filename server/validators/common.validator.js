import { z } from "zod";

/**
 * 24-character hexadecimal MongoDB ObjectId validator.
 * Rejects any non-string, object-injection payload, or malformed hex sequence.
 */
export const objectIdSchema = z
  .string({
    required_error: "ID is required",
    invalid_type_error: "ID must be a string",
  })
  .regex(/^[0-9a-fA-F]{24}$/, "Invalid ObjectId format (must be 24-character hexadecimal)");

/**
 * Optional or nullable ObjectId schema (used for root folder or optional parent directories).
 */
export const optionalObjectIdSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, "Invalid ObjectId format")
  .nullable()
  .optional();

/**
 * Target directory identifier which can be a valid ObjectId, the literal "root", or null.
 */
export const targetDirIdSchema = z
  .union([
    objectIdSchema,
    z.literal("root"),
    z.literal(""),
    z.null(),
  ])
  .optional();

/**
 * Resource type discriminator: strictly "file" or "directory".
 */
export const resourceTypeSchema = z.enum(["file", "directory"], {
  errorMap: () => ({
    message: "resourceType must be either 'file' or 'directory'",
  }),
});

/**
 * Strict file or directory name schema.
 * Disallows path traversal characters, illegal file system characters, and blank spaces.
 */
export const safeFilenameSchema = z
  .string({
    required_error: "Name is required",
    invalid_type_error: "Name must be a string",
  })
  .trim()
  .min(1, "Name cannot be empty")
  .max(255, "Name cannot exceed 255 characters")
  .refine(
    (name) => !/[<>:"/\\|?*\x00-\x1F]/.test(name),
    "Name contains illegal characters (< > : \" / \\ | ? *)"
  );

/**
 * Clean email schema: trimmed, lowercased, and RFC-compliant.
 */
export const emailSchema = z
  .string({
    required_error: "Email is required",
    invalid_type_error: "Email must be a string",
  })
  .trim()
  .toLowerCase()
  .email("Please enter a valid email address");

/**
 * Numeric OTP schema (supports 4 to 6 digits).
 */
export const otpSchema = z
  .string({
    required_error: "Verification code is required",
    invalid_type_error: "Verification code must be a string",
  })
  .trim()
  .regex(/^\d{4,6}$/, "Verification code must be a 4 to 6 digit number");

/**
 * Pagination & list query schema.
 */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
});
