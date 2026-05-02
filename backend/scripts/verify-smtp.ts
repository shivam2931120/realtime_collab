import "dotenv/config";
import { verifySmtpConnection } from "../src/utils/mailer";

const run = async () => {
  try {
    const result = await verifySmtpConnection();

    if (!result.ok) {
      console.error("SMTP not ready:", result.reason);
      process.exit(1);
    }

    console.log("SMTP verify passed.");
  } catch (error: any) {
    console.error("SMTP verify failed:", error?.message || error);
    process.exit(1);
  }
};

run();
