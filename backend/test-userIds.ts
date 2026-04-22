import { clerkClient } from "@clerk/clerk-sdk-node";
import 'dotenv/config';

async function main() {
  try {
    const users = await clerkClient.users.getUserList({ userId: ["test_123"] });
    console.log("Success:", Array.isArray(users));
  } catch (e) {
    console.error("CATCH:", e);
  }
}
main();
