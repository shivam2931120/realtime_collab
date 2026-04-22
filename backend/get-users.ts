import { clerkClient } from "@clerk/clerk-sdk-node";
import 'dotenv/config';

async function main() {
    const users = await clerkClient.users.getUserList();
    const userList = Array.isArray(users) ? users : (users as any).data || [];
    console.log(userList.map((u: any) => ({
        id: u.id,
        email: u.emailAddresses[0]?.emailAddress
    })));
}
main();