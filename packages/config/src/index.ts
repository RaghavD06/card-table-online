import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  WEB_ORIGIN: z.string().url().default("http://localhost:3000"),
  WEB_ORIGINS: z.string().default(""),
  SERVER_PORT: z.coerce.number().int().positive().optional(),
  PORT: z.coerce.number().int().positive().optional(),
  DATABASE_URL: z.string().min(1).default("postgresql://cardtable:cardtable@localhost:5432/cardtable?schema=public"),
  REDIS_URL: z.string().min(1).default("redis://localhost:6379"),
  AUTH_SECRET: z.string().min(16).default("development-only-change-me"),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
}).superRefine((value, context) => {
  if (value.NODE_ENV === "production" && value.AUTH_SECRET === "development-only-change-me") {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["AUTH_SECRET"], message: "AUTH_SECRET must be explicitly configured in production" });
  }
});

const parsed = schema.parse(process.env);
const origins = [parsed.WEB_ORIGIN, ...parsed.WEB_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean)]
  .filter((origin, index, allOrigins) => allOrigins.indexOf(origin) === index);
for (const origin of origins) {
  const parsedOrigin = new URL(origin);
  if (parsedOrigin.protocol !== "http:" && parsedOrigin.protocol !== "https:") {
    throw new Error("WEB_ORIGIN(S) must use http or https");
  }
}

export const config = {
  ...parsed,
  SERVER_PORT: parsed.PORT ?? parsed.SERVER_PORT ?? 4000,
  WEB_ORIGINS: origins,
} as const;
export type AppConfig = typeof config;
