import { Response } from "express";
import { AuthRequest } from "../middleware/authMiddleware";
import { supabase } from "../config/supabase";
import { buildDeliveryHeaders, buildProviderPayload, createSigningSecret, IntegrationProvider, validateIntegrationEndpoint } from "../utils/outboundIntegrations";

const providers = new Set(["webhook", "slack", "discord", "teams"]);
const allowedEvents = new Set(["document_created", "document_updated", "document_shared", "document_commented", "document_exported", "document_deleted", "document_restored", "document_ownership_transferred", "document_public_link_created", "document_public_link_revoked", "document_attachment_uploaded", "document_attachment_deleted", "document_deadline_created", "document_deadline_updated", "document_suggestion_created", "document_suggestion_decided"]);
const shape = (row: any) => ({ id: row.id, name: row.name, provider: row.provider, endpointUrl: row.endpoint_url, eventTypes: row.event_types || [], enabled: row.enabled, hasSigningSecret: Boolean(row.signing_secret), createdAt: row.created_at, updatedAt: row.updated_at });

export const listIntegrations = async (req: AuthRequest, res: Response) => {
  const { data, error } = await supabase.from("outbound_integrations").select("*").eq("owner_id", req.auth!.userId).order("created_at", { ascending: false });
  if (error) return res.status(500).json({ message: "Integrations could not be loaded" });
  return res.json({ integrations: (data || []).map(shape) });
};

export const createIntegration = async (req: AuthRequest, res: Response) => {
  try {
    const provider = String(req.body.provider || "") as IntegrationProvider;
    if (!providers.has(provider)) return res.status(400).json({ message: "Unsupported integration provider" });
    const name = String(req.body.name || "").trim();
    if (!name || name.length > 80) return res.status(400).json({ message: "Integration name is required and must be under 80 characters" });
    const endpointUrl = validateIntegrationEndpoint(String(req.body.endpointUrl || ""));
    const requestedEvents: string[] = Array.isArray(req.body.eventTypes) ? req.body.eventTypes.map((value: unknown) => String(value)) : [];
    const eventTypes = [...new Set<string>(requestedEvents)].filter((value) => allowedEvents.has(value));
    if (!eventTypes.length) return res.status(400).json({ message: "Select at least one supported event" });
    const signingSecret = provider === "webhook" ? createSigningSecret() : null;
    const { data, error } = await supabase.from("outbound_integrations").insert({ owner_id: req.auth!.userId, name, provider, endpoint_url: endpointUrl, event_types: eventTypes, signing_secret: signingSecret }).select("*").single();
    if (error || !data) throw error || new Error("Insert failed");
    return res.status(201).json({ integration: shape(data), signingSecret });
  } catch (error) {
    return res.status(400).json({ message: (error as Error).message || "Integration could not be created" });
  }
};

export const updateIntegration = async (req: AuthRequest, res: Response) => {
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof req.body.enabled === "boolean") updates.enabled = req.body.enabled;
  if (req.body.name !== undefined) updates.name = String(req.body.name).trim().slice(0, 80);
  if (req.body.endpointUrl !== undefined) {
    try { updates.endpoint_url = validateIntegrationEndpoint(String(req.body.endpointUrl)); } catch (error) { return res.status(400).json({ message: (error as Error).message }); }
  }
  const { data, error } = await supabase.from("outbound_integrations").update(updates).eq("id", req.params.id).eq("owner_id", req.auth!.userId).select("*").single();
  if (error || !data) return res.status(404).json({ message: "Integration not found" });
  return res.json({ integration: shape(data) });
};

export const deleteIntegration = async (req: AuthRequest, res: Response) => {
  const { data } = await supabase.from("outbound_integrations").delete().eq("id", req.params.id).eq("owner_id", req.auth!.userId).select("id").single();
  if (!data) return res.status(404).json({ message: "Integration not found" });
  return res.status(204).send();
};

export const testIntegration = async (req: AuthRequest, res: Response) => {
  const { data } = await supabase.from("outbound_integrations").select("*").eq("id", req.params.id).eq("owner_id", req.auth!.userId).single();
  if (!data) return res.status(404).json({ message: "Integration not found" });
  try {
    const event = { id: "test", type: "integration_test", documentId: "test", documentTitle: "Integration test", actorId: req.auth!.userId, actorEmail: req.auth!.email, metadata: { test: true }, createdAt: new Date().toISOString() };
    const payload = JSON.stringify(buildProviderPayload(data.provider, event));
    const response = await fetch(validateIntegrationEndpoint(data.endpoint_url), { method: "POST", headers: buildDeliveryHeaders(data.provider, payload, data.signing_secret), body: payload, signal: AbortSignal.timeout(8000), redirect: "error" });
    if (!response.ok) return res.status(502).json({ message: `Provider returned HTTP ${response.status}` });
    return res.json({ delivered: true, responseCode: response.status });
  } catch (error) { return res.status(502).json({ message: (error as Error).message }); }
};

export const listDeliveries = async (req: AuthRequest, res: Response) => {
  const { data: integration } = await supabase.from("outbound_integrations").select("id").eq("id", req.params.id).eq("owner_id", req.auth!.userId).single();
  if (!integration) return res.status(404).json({ message: "Integration not found" });
  const { data } = await supabase.from("outbound_deliveries").select("*").eq("integration_id", integration.id).order("attempted_at", { ascending: false }).limit(30);
  return res.json({ deliveries: data || [] });
};
