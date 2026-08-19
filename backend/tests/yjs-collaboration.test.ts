import assert from "node:assert/strict";
import test from "node:test";

test("Yjs converges concurrent edits without dropping either writer", async () => {
  const Y = await import("yjs");
  const left = new Y.Doc();
  const right = new Y.Doc();
  const leftText = left.getText("content");
  const rightText = right.getText("content");

  leftText.insert(0, "Alpha");
  rightText.insert(0, "Beta");
  const leftUpdate = Y.encodeStateAsUpdate(left);
  const rightUpdate = Y.encodeStateAsUpdate(right);

  Y.applyUpdate(left, rightUpdate);
  Y.applyUpdate(right, leftUpdate);

  assert.equal(leftText.toString(), rightText.toString());
  assert.match(leftText.toString(), /Alpha/);
  assert.match(leftText.toString(), /Beta/);
});

test("Yjs state updates can be persisted as base64 and restored", async () => {
  const Y = await import("yjs");
  const source = new Y.Doc();
  source.getText("content").insert(0, "Persisted collaboration state");
  const encoded = Buffer.from(Y.encodeStateAsUpdate(source)).toString("base64");
  const restored = new Y.Doc();
  Y.applyUpdate(restored, Uint8Array.from(Buffer.from(encoded, "base64")));
  assert.equal(restored.getText("content").toString(), "Persisted collaboration state");
});
