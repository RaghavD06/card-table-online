import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  WEB_ORIGIN: z.string().url().default("http://localhost:3000"),
  SERVER_PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1).default("postgresql://cardtable:cardtable@localhost:5432/cardtable?schema=public"),
  REDIS_URL: z.string().min(1).default("redis://localhost:6379"),
  AUTH_SECRET: z.string().min(16).default("development-only-change-me"),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
});

export const config = schema.parse(process.env);
export type AppConfig = typeof config;
