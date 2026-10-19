import assert from "node:assert/strict";
import test from "node:test";
import { runWritingAssistant } from "../src/utils/nvidiaAi";

test("writing assistant uses Nemotron Ultra without exposing reasoning as document text", async (t) => {
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    assert.equal(url, "https://integrate.api.nvidia.com/v1/chat/completions");
    assert.equal((init.headers as Record<string, string>).Authorization, "Bearer unit-test-key");
    const body = JSON.parse(String(init.body));
    assert.equal(body.model, "nvidia/nemotron-3-ultra-550b-a55b");
    assert.deepEqual(body.chat_template_kwargs, { enable_thinking: false });
    assert.equal(body.stream, false);
    return new Response(JSON.stringify({ choices: [{ message: { content: "Corrected sentence.", reasoning_content: "Private reasoning" } }] }));
  });
  const previous = { key: process.env.NVIDIA_API_KEY, model: process.env.NVIDIA_NEMOTRON_MODEL, url: process.env.NVIDIA_API_BASE_URL };
  process.env.NVIDIA_API_KEY = "unit-test-key";
  delete process.env.NVIDIA_NEMOTRON_MODEL;
  delete process.env.NVIDIA_API_BASE_URL;
  try {
    const result = await runWritingAssistant({ action: "grammar", text: "Correct this sentence." });
    assert.equal(result.content, "Corrected sentence.");
    assert.equal(result.model, "nvidia/nemotron-3-ultra-550b-a55b");
  } finally {
    for (const [name, value] of [["NVIDIA_API_KEY", previous.key], ["NVIDIA_NEMOTRON_MODEL", previous.model], ["NVIDIA_API_BASE_URL", previous.url]]) {
      if (value === undefined) delete process.env[name!];
      else process.env[name!] = value;
    }
  }
});

test("writing assistant rejects upstream failures and empty replies", async (t) => {
  const previousKey = process.env.NVIDIA_API_KEY;
  process.env.NVIDIA_API_KEY = "unit-test-key";
  try {
    const fetchMock = t.mock.method(globalThis, "fetch", async () => new Response("Rate limited", { status: 429 }));
    await assert.rejects(runWritingAssistant({ action: "summarize", text: "A note." }), /429/);
    fetchMock.mock.mockImplementation(async () => new Response(JSON.stringify({ choices: [{ message: { content: "", reasoning_content: "Reasoning only" } }] })));
    await assert.rejects(runWritingAssistant({ action: "summarize", text: "A note." }), /empty response/);
  } finally {
    if (previousKey === undefined) delete process.env.NVIDIA_API_KEY;
    else process.env.NVIDIA_API_KEY = previousKey;
  }
});
