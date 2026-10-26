import { z } from "zod";
export const categories = [
  "Healthcare",
  "E-commerce",
  "Education",
  "Productivity",
  "Food & Restaurant",
  "Real Estate",
] as const;
export const registerSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    email: z.email().toLowerCase().max(254),
    password: z.string().min(12).max(128),
    role: z.enum(["buyer", "builder"]),
  })
  .strict();
export const loginSchema = z
  .object({
    email: z.email().toLowerCase().max(254),
    password: z.string().min(1).max(128),
  })
  .strict();
const text = z.string().trim().min(1).max(300);
export const productSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    description: z.string().trim().min(20).max(4000),
    category: z.enum(categories),
    technology: z.array(text).min(1).max(8),
    features: z.array(text).min(1).max(12),
    screenshots: z
      .array(
        z
          .string()
          .max(2000)
          .refine((s) => {
            try {
              return (
                /^\/previews\/[a-z]+\.svg$/.test(s) ||
                new URL(s).protocol === "https:"
              );
            } catch {
              return false;
            }
          }, "Screenshots must use HTTPS URLs"),
      )
      .max(6),
    price_cents: z.number().int().min(100).max(10000000),
    repository: z
      .string()
      .regex(/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/?$/),
    license: z.string().trim().min(20).max(4000),
  })
  .strict();
export const reviewSchema = z
  .object({
    expected_revision: z.number().int().min(1).max(2147483647),
    status: z.enum(["approved", "rejected"]),
    review_note: z.string().trim().min(10).max(3000),
    audit_findings: z.string().trim().max(5000).default(""),
    audit_status: z.enum(["not_reviewed", "reviewed"]),
  })
  .strict()
  .refine(
    (v) => v.audit_status !== "reviewed" || v.audit_findings.length >= 30,
    {
      message:
        "Record specific review findings (at least 30 characters) before marking a project reviewed.",
    },
  );
export const requestSchema = z
  .object({
    kind: z.enum([
      "development",
      "design",
      "infrastructure",
      "customization",
      "deployment",
    ]),
    description: z.string().trim().min(20).max(4000),
    product_id: z.uuid().nullable().optional(),
  })
  .strict();
export const idSchema = z.uuid();
