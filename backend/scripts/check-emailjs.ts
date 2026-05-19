import "dotenv/config";
import { getEmailDeliveryStatus, verifyEmailDeliveryConfig } from "../src/utils/mailer";

const run = async () => {
  const result = await verifyEmailDeliveryConfig();

  if (!result.ok) {
    console.error("EmailJS not ready:", result.reason);
    process.exit(1);
  }

  const status = getEmailDeliveryStatus();
  console.log(
    JSON.stringify(
      {
        ok: true,
        provider: status.provider,
        endpoint: status.endpoint,
        serviceIdSet: status.serviceIdSet,
        templateIdSet: status.templateIdSet,
        publicKeySet: status.publicKeySet,
        privateKeySet: status.privateKeySet,
      },
      null,
      2,
    ),
  );
};

run().catch((error: any) => {
  console.error("EmailJS config check failed:", error?.message || error);
  process.exit(1);
});
