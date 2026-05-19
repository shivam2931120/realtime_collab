import "dotenv/config";
import { sendDocumentSharedEmail } from "../src/utils/mailer";

const run = async () => {
  const to = String(process.argv[2] || process.env.SMTP_TEST_TO || "").trim();

  if (!to) {
    console.error("Usage: npm run smtp:test -- recipient@example.com");
    process.exit(1);
  }

  const result = await sendDocumentSharedEmail({
    to,
    actorEmail: String(process.env.SMTP_USER || "no-reply@example.com"),
    documentTitle: "Editorial SMTP test",
    documentUrl: String(process.env.CLIENT_URL || "http://localhost:5173"),
    role: "editor",
  });

  console.log(JSON.stringify(result, null, 2));
};

run().catch((error: any) => {
  console.error("SMTP test email failed:", error?.message || error);
  process.exit(1);
});
