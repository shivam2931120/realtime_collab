import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { getDatabaseConnectionErrorCode } from "../utils/dbErrors";

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY; // Use service role for backend admin capabilities

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing Supabase credentials in .env");
}

try {
  const parsedUrl = new URL(supabaseUrl);
  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    throw new Error("SUPABASE_URL must use http or https");
  }
} catch (error) {
  throw new Error(`Invalid SUPABASE_URL: ${(error as Error).message}`);
}

export const supabase = createClient(supabaseUrl, supabaseKey);

export const checkDatabaseConnection = async () => {
  const startedAt = Date.now();

  try {
    const { error } = await supabase.from("auth_users").select("id").limit(1);
    if (error) {
      return {
        connected: false,
        latencyMs: Date.now() - startedAt,
        code: getDatabaseConnectionErrorCode(error) || error.code || "DATABASE_QUERY_FAILED",
      };
    }

    return {
      connected: true,
      latencyMs: Date.now() - startedAt,
      code: null,
    };
  } catch (error) {
    const cause = (error as { cause?: { code?: string } })?.cause;
    return {
      connected: false,
      latencyMs: Date.now() - startedAt,
      code: cause?.code || "DATABASE_UNREACHABLE",
    };
  }
};
