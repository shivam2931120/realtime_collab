import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const requiredRelations = [
  "auth_users",
  "auth_refresh_tokens",
  "auth_password_reset_tokens",
  "folders",
  "documents",
  "document_collaborators",
  "comments",
  "notifications",
  "document_versions",
  "document_tags",
  "document_templates",
  "document_events",
  "document_collaboration_states",
  "document_public_links",
  "document_attachments",
  "outbound_integrations",
  "outbound_deliveries",
  "document_deadlines",
  "document_suggestions",
  "workspace_users",
  "workspace_files",
  "workspace_permissions",
  "workspace_comments",
];

const supabaseUrl = String(process.env.SUPABASE_URL || "").trim();
const supabaseKey = String(process.env.SUPABASE_SERVICE_KEY || "").trim();

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const run = async () => {
  const results = await Promise.all(
    requiredRelations.map(async (relation) => {
      const { error } = await supabase
        .from(relation)
        .select("*")
        .limit(1);

      return {
        relation,
        ok: !error,
        error: error?.message || null,
      };
    }),
  );

  const missing = results.filter((result) => !result.ok);
  console.log(JSON.stringify(results, null, 2));

  if (missing.length) {
    console.error(`Supabase schema check failed: ${missing.length} relation(s) missing or inaccessible.`);
    process.exit(1);
  }

  console.log("Supabase schema check passed.");
};

run().catch((error: any) => {
  console.error("Supabase schema check failed:", error?.message || error);
  process.exit(1);
});
