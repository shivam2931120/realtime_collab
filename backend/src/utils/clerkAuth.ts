import { createClerkClient, verifyToken } from "@clerk/backend";
import { buildAuthUser } from "./authToken";

export const clerkEnabled = Boolean(process.env.CLERK_SECRET_KEY);

const clerkClient = clerkEnabled
  ? createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY })
  : null;

const authorizedParties = String(process.env.CLERK_AUTHORIZED_PARTIES || process.env.CLIENT_URL || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim().replace(/\/+$/, ""))
  .filter(Boolean);

export const verifyClerkUser = async (token: string) => {
  if (!clerkClient) throw new Error("Clerk is not configured");
  const claims = await verifyToken(token, {
    secretKey: process.env.CLERK_SECRET_KEY,
    authorizedParties,
  });
  if (!claims.sub || !claims.sid) throw new Error("Invalid Clerk session");

  const clerkUser = await clerkClient.users.getUser(claims.sub);
  const primaryEmail = clerkUser.emailAddresses.find(
    (address) => address.id === clerkUser.primaryEmailAddressId && address.verification?.status === "verified",
  )?.emailAddress;
  if (!primaryEmail) throw new Error("A verified primary email is required");

  return { ...buildAuthUser(primaryEmail), sessionId: String(claims.sid) };
};
