import "dotenv/config";

const run = async () => {
  const publicKey = String(process.env.EMAILJS_PUBLIC_KEY || "").trim();
  const privateKey = String(process.env.EMAILJS_PRIVATE_KEY || "").trim();
  const count = Math.min(50, Math.max(1, Number(process.env.EMAILJS_HISTORY_COUNT || 10)));

  if (!publicKey || !privateKey) {
    console.error("EmailJS history needs EMAILJS_PUBLIC_KEY and EMAILJS_PRIVATE_KEY.");
    process.exit(1);
  }

  const params = new URLSearchParams({
    user_id: publicKey,
    accessToken: privateKey,
    page: "1",
    count: String(count),
  });

  const response = await fetch(`https://api.emailjs.com/api/v1.1/history?${params.toString()}`);
  const body = await response.text();

  if (!response.ok) {
    console.error(`EmailJS history failed (${response.status}): ${body || response.statusText}`);
    process.exit(1);
  }

  const parsed = JSON.parse(body) as {
    rows?: Array<{
      id?: string;
      result?: number;
      error?: string | null;
      provider?: string;
      service_id?: string;
      template_id?: string;
      created_at?: string;
    }>;
  };

  console.log(
    JSON.stringify(
      (parsed.rows || []).map((row) => ({
        id: row.id,
        result: row.result,
        error: row.error,
        provider: row.provider,
        serviceId: row.service_id,
        templateId: row.template_id,
        createdAt: row.created_at,
      })),
      null,
      2,
    ),
  );
};

run().catch((error: any) => {
  console.error("EmailJS history check failed:", error?.message || error);
  process.exit(1);
});
