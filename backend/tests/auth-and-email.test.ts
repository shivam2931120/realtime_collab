import assert from "node:assert/strict";
import test from "node:test";

process.env.AUTH_TOKEN_SECRET = "unit-test-secret-with-enough-entropy";
process.env.AUTH_TOKEN_TTL_SECONDS = "120";

test("user identity helpers normalize and round-trip deterministic user ids", async () => {
  const { emailFromUserId, isValidEmail, normalizeEmail, userIdFromEmail } = await import("../src/utils/userIdentity");

  const email = normalizeEmail("  User.Name+Demo@Example.COM ");
  const userId = userIdFromEmail(email);

  assert.equal(email, "user.name+demo@example.com");
  assert.equal(isValidEmail(email), true);
  assert.equal(emailFromUserId(userId), email);
  assert.equal(emailFromUserId("legacy owner id"), "legacy-owner-id@legacy.local");
});

test("auth tokens reject tampering and preserve the signed user identity", async () => {
  const { buildAuthUser, issueAuthToken, verifyAuthToken } = await import("../src/utils/authToken");

  const user = buildAuthUser("member@example.com");
  const token = issueAuthToken(user);

  assert.deepEqual(verifyAuthToken(token), user);
  assert.throws(() => verifyAuthToken(`${token}tampered`), /signature|format|malformed/i);
});

test("EmailJS readiness reports missing and configured provider state", async () => {
  const { getEmailDeliveryStatus } = await import("../src/utils/mailer");

  const previousEnv = {
    serviceId: process.env.EMAILJS_SERVICE_ID,
    templateId: process.env.EMAILJS_TEMPLATE_ID,
    publicKey: process.env.EMAILJS_PUBLIC_KEY,
    privateKey: process.env.EMAILJS_PRIVATE_KEY,
  };

  delete process.env.EMAILJS_SERVICE_ID;
  delete process.env.EMAILJS_TEMPLATE_ID;
  delete process.env.EMAILJS_PUBLIC_KEY;
  delete process.env.EMAILJS_PRIVATE_KEY;
  assert.equal(getEmailDeliveryStatus().enabled, false);

  process.env.EMAILJS_SERVICE_ID = "service_a2qi7a2";
  process.env.EMAILJS_TEMPLATE_ID = "template_test";
  process.env.EMAILJS_PUBLIC_KEY = "public_test";
  process.env.EMAILJS_PRIVATE_KEY = "private_test";

  const status = getEmailDeliveryStatus();
  assert.equal(status.enabled, true);
  assert.equal(status.provider, "emailjs");
  assert.equal(status.serviceIdSet, true);

  if (previousEnv.serviceId === undefined) delete process.env.EMAILJS_SERVICE_ID;
  else process.env.EMAILJS_SERVICE_ID = previousEnv.serviceId;
  if (previousEnv.templateId === undefined) delete process.env.EMAILJS_TEMPLATE_ID;
  else process.env.EMAILJS_TEMPLATE_ID = previousEnv.templateId;
  if (previousEnv.publicKey === undefined) delete process.env.EMAILJS_PUBLIC_KEY;
  else process.env.EMAILJS_PUBLIC_KEY = previousEnv.publicKey;
  if (previousEnv.privateKey === undefined) delete process.env.EMAILJS_PRIVATE_KEY;
  else process.env.EMAILJS_PRIVATE_KEY = previousEnv.privateKey;
});
