import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  WEB_ORIGIN: z.string().url().default("http://localhost:3000"),
  SERVER_PORT: z.coerce.number().int().positive().default(Number(process.env.PORT ?? 4000)),
  DATABASE_URL: z.string().min(1).default("postgresql://cardtable:cardtable@localhost:5432/cardtable?schema=public"),
  REDIS_URL: z.string().min(1).default("redis://localhost:6379"),
  AUTH_SECRET: z.string().min(16).default("development-only-change-me"),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
}).superRefine((value, context) => {
  if (value.NODE_ENV !== "production") return;

  for (const key of ["WEB_ORIGIN", "DATABASE_URL", "REDIS_URL", "AUTH_SECRET"] as const) {
    if (!process.env[key]) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [key],
        message: `${key} must be set explicitly in production`,
      });
    }
  }
});

export const config = schema.parse(process.env);
export type AppConfig = typeof config;
