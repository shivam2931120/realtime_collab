import assert from "node:assert/strict";
import test from "node:test";

process.env.SUPABASE_URL ||= "https://test-project.supabase.co";
process.env.SUPABASE_SERVICE_KEY ||= "test-service-role-key";

test("integration endpoints reject unsafe destinations and require HTTPS", async () => {
  const { validateIntegrationEndpoint } = await import("../src/utils/outboundIntegrations");
  assert.throws(() => validateIntegrationEndpoint("http://hooks.example.com/test"), /HTTPS/);
  assert.throws(() => validateIntegrationEndpoint("https://localhost/hook"), /Private|local/);
  assert.throws(() => validateIntegrationEndpoint("https://127.0.0.1/hook"), /Private|local/);
  assert.throws(() => validateIntegrationEndpoint("https://192.168.1.5/hook"), /Private|local/);
  assert.equal(validateIntegrationEndpoint("https://hooks.example.com/editorial"), "https://hooks.example.com/editorial");
});

test("provider payloads preserve a consistent event meaning", async () => {
  const { buildDeliveryHeaders, buildProviderPayload } = await import("../src/utils/outboundIntegrations");
  const event = { id: "evt-1", type: "document_updated", documentId: "doc-1", documentTitle: "Plan", actorId: "user-1", actorEmail: "user@example.com", metadata: { source: "test" }, createdAt: "2026-09-01T00:00:00.000Z" };
  const generic = buildProviderPayload("webhook", event) as any;
  const slack = buildProviderPayload("slack", event) as any;
  const discord = buildProviderPayload("discord", event) as any;
  const teams = buildProviderPayload("teams", event) as any;
  assert.equal(generic.type, event.type);
  assert.equal(generic.data.document.id, event.documentId);
  assert.match(slack.text, /updated.*Plan/);
  assert.match(discord.content, /updated.*Plan/);
  assert.match(teams.text, /Editorial.*updated.*Plan/);
  const headers = buildDeliveryHeaders("webhook", JSON.stringify(generic), "secret");
  assert.match(headers["x-editorial-signature"], /^sha256=[a-f0-9]{64}$/);
  assert.match(headers["x-editorial-timestamp"], /^\d+$/);
});
