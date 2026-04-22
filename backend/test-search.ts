import { clerkClient } from "@clerk/clerk-sdk-node";
import 'dotenv/config';

async function main() {
  try {
    const usersResponse = await clerkClient.users.getUserList({
      emailAddress: ["shivam.bgp@outlook.com"],
    });
    console.log("Users:", usersResponse);
  } catch (e) {
    console.error("CATCH:", e);
  }
}
main();
