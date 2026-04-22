import { clerkClient } from "@clerk/clerk-sdk-node";
import 'dotenv/config';

async function main() {
  try {
    const users = await clerkClient.users.getUserList({ emailAddress: ["shivam.bgp@outlook.com"] });
    console.log(Array.isArray(users), "is array?");
    console.log(users);
  } catch (e) {
    console.error(e);
  }
}
main();
