import { createClient } from "@supabase/supabase-js";
import { clerkClient } from "@clerk/clerk-sdk-node";
import 'dotenv/config';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

async function main() {
  try {
    const userId = "user_2test"; // fake ID
    
    // Test getUserList like enrichWithUserEmail
    const actorEmail = "fake@example.com";

    const { data: docData, error: docError } = await supabase
      .from("documents")
      .insert({ title: "Test Doc", content: "<p></p>", owner_id: userId, folder_id: null })
      .select("*")
      .single();
    
    if (docError) throw docError;

    const collabsToInsert = [{ document_id: docData.id, user_id: "user_collab", role: "editor" }];
    const { error: collabError } = await supabase.from("document_collaborators").insert(collabsToInsert);
    if (collabError) throw collabError;

    const addedCollaborators = [{ user: "user_collab", role: "editor", email: "test@example.com" }];

    const notifications = addedCollaborators.flatMap((item) => [
      {
        recipient_id: item.user,
        sender_id: userId,
        document_id: docData.id,
        type: "document_shared",
        message: `${actorEmail} shared "Test Doc" with you as ${item.role}.`,
      },
      {
        recipient_id: userId,
        sender_id: userId,
        document_id: docData.id,
        type: "document_shared",
        message: `You shared "Test Doc" with ${item.email ?? "a collaborator"} as ${item.role}.`,
      }
    ]);
  
    const { error: notifError } = await supabase.from("notifications").insert(notifications);
    if (notifError) throw notifError;

    console.log("ALL SUCCESS!");
    await supabase.from("documents").delete().eq("id", docData.id);
  } catch (e) {
    console.error("CATCH ERROR:", e);
  }
}
main();
