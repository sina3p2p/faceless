import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { DATABASE, APP } from "@/lib/constants";

const globalForDb = globalThis as unknown as { db: ReturnType<typeof drizzle<typeof schema>> };

function createDb() {
  const client = postgres(DATABASE.url, { max: 10 });
  return drizzle(client, { schema });
}

export const db = globalForDb.db ?? createDb();

if (!APP.isProduction) globalForDb.db = db;
