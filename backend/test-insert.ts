import { createClient } from "@supabase/supabase-js";
import 'dotenv/config';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

async function main() {
  try {
    const { data: docData, error: docError } = await supabase
      .from("documents")
      .insert({ title: "Test Doc", content: "<p></p>", owner_id: "user_2test", folder_id: null })
      .select("*")
      .single();
    
    if (docError) {
        console.log("INSERT ERROR:", docError);
    } else {
        console.log("INSERT SUCCESS:", docData);
        await supabase.from("documents").delete().eq("id", docData.id);
    }
  } catch (e) {
    console.error("CATCH:", e);
  }
}
main();
