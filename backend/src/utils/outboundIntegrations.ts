import crypto from "node:crypto";
import net from "node:net";
import { supabase } from "../config/supabase";

export type IntegrationProvider = "webhook" | "slack" | "discord" | "teams";

type OutboundEvent = {
  id: string;
  type: string;
  documentId: string;
  documentTitle: string;
  actorId: string;
  actorEmail: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

const isPrivateIpv4 = (hostname: string) => {
  const parts = hostname.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return false;
  return parts[0] === 10 || parts[0] === 127 || (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168);
};

export const validateIntegrationEndpoint = (raw: string) => {
  const endpoint = new URL(raw);
  if (endpoint.protocol !== "https:") throw new Error("Integration URL must use HTTPS");
  const hostname = endpoint.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost") || isPrivateIpv4(hostname) ||
      (net.isIP(hostname) === 6 && (hostname === "::1" || hostname.startsWith("fc") || hostname.startsWith("fd") || hostname.startsWith("fe80")))) {
    throw new Error("Private or local integration URLs are not allowed");
  }
  return endpoint.toString();
};

export const buildProviderPayload = (provider: IntegrationProvider, event: OutboundEvent) => {
  const text = `${event.actorEmail} ${event.type.replace(/^document_/, "").replace(/_/g, " ")} “${event.documentTitle}”`;
  if (provider === "slack") return { text, blocks: [{ type: "section", text: { type: "mrkdwn", text: `*Editorial* · ${text}` } }] };
  if (provider === "discord") return { content: `**Editorial** · ${text}`, allowed_mentions: { parse: [] } };
  if (provider === "teams") return { text: `Editorial · ${text}` };
  return { id: event.id, type: event.type, createdAt: event.createdAt, data: { document: { id: event.documentId, title: event.documentTitle }, actor: { id: event.actorId, email: event.actorEmail }, metadata: event.metadata } };
};

export const buildDeliveryHeaders = (provider: IntegrationProvider, payload: string, signingSecret?: string | null) => {
  const headers: Record<string, string> = { "content-type": "application/json", "user-agent": "Editorial-Webhooks/1.0" };
  if (provider === "webhook" && signingSecret) {
    const timestamp = String(Math.floor(Date.now() / 1000));
    headers["x-editorial-timestamp"] = timestamp;
    headers["x-editorial-signature"] = `sha256=${crypto.createHmac("sha256", signingSecret).update(`${timestamp}.${payload}`).digest("hex")}`;
  }
  return headers;
};

export const dispatchDocumentEvent = async (event: OutboundEvent, ownerId: string) => {
  const { data: integrations } = await supabase.from("outbound_integrations").select("*").eq("owner_id", ownerId).eq("enabled", true);
  await Promise.all((integrations || []).filter((item: any) => Array.isArray(item.event_types) && item.event_types.includes(event.type)).map(async (item: any) => {
    let responseCode: number | null = null;
    let errorMessage: string | null = null;
    try {
      const payload = JSON.stringify(buildProviderPayload(item.provider, event));
      const headers = buildDeliveryHeaders(item.provider, payload, item.signing_secret);
      const response = await fetch(validateIntegrationEndpoint(item.endpoint_url), { method: "POST", headers, body: payload, signal: AbortSignal.timeout(8000), redirect: "error" });
      responseCode = response.status;
      if (!response.ok) errorMessage = `Provider returned HTTP ${response.status}`;
    } catch (error) {
      errorMessage = (error as Error).message.slice(0, 500);
    }
    await supabase.from("outbound_deliveries").insert({ integration_id: item.id, event_id: event.id, status: errorMessage ? "failed" : "delivered", response_code: responseCode, error_message: errorMessage });
  }));
};

export const createSigningSecret = () => crypto.randomBytes(32).toString("hex");
