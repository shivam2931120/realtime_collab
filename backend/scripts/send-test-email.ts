import "dotenv/config";
import { sendDocumentSharedEmail } from "../src/utils/mailer";

const run = async () => {
  const to = String(process.argv[2] || process.env.EMAIL_TEST_TO || "").trim();

  if (!to) {
    console.error("Usage: npm run email:test -- recipient@example.com");
    process.exit(1);
  }

  const result = await sendDocumentSharedEmail({
    to,
    actorEmail: String(process.env.EMAILJS_TEST_ACTOR || "owner@example.com"),
    documentTitle: "Editorial EmailJS test",
    documentUrl: String(process.env.CLIENT_URL || "http://localhost:5173"),
    role: "editor",
  });

  console.log(JSON.stringify(result, null, 2));
};

run().catch((error: any) => {
  console.error("EmailJS test email failed:", error?.message || error);
  process.exit(1);
});
