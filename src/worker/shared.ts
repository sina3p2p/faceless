import { exec } from "child_process";
import { promisify } from "util";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq, and, ne, desc } from "drizzle-orm";
import * as schema from "@/server/db/schema";
import { DATABASE } from "@/lib/constants";

const client = postgres(DATABASE.url);
export const db = drizzle(client, { schema });
export { schema, eq, and, ne, desc };

export const execAsync = promisify(exec);