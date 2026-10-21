import assert from "node:assert/strict";
import { HttpFavoritesRepository } from "../src/platform/http-repositories";

const originalFetch = globalThis.fetch;
let activeRows: Array<Record<string, unknown>> = [
  { id: "f1", kind: "tool", target_id: "json-formatter", created_at: "2026-10-01T00:00:00.000Z" },
];
let favoritesGets = 0;
let togglePosts = 0;

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const method = String(init?.method ?? "GET").toUpperCase();
  if (url === "/api/account/favorites" && method === "GET") {
    favoritesGets += 1;
    await new Promise((resolve) => setTimeout(resolve, 15));
    return new Response(JSON.stringify(activeRows), { status: 200, headers: { "Content-Type": "application/json" } });
  }
  if (url === "/api/account/favorites/toggle" && method === "POST") {
    togglePosts += 1;
    const body = JSON.parse(String(init?.body ?? "{}")) as { kind?: string; targetId?: string };
    const exists = activeRows.some((row) => row.kind === body.kind && row.target_id === body.targetId);
    activeRows = exists
      ? activeRows.filter((row) => !(row.kind === body.kind && row.target_id === body.targetId))
      : [...activeRows, { id: `f${activeRows.length + 1}`, kind: body.kind, target_id: body.targetId, created_at: new Date().toISOString() }];
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
  }
  if (url === "/api/auth/csrf") {
    return new Response(JSON.stringify({ token: "test-csrf" }), { status: 200, headers: { "Content-Type": "application/json" } });
  }
  throw new Error(`Unexpected test request: ${method} ${url}`);
}) as typeof fetch;

try {
  const repository = new HttpFavoritesRepository();
  repository.setUserScope("user-a");
  let first: string[] = [];
  let second: string[] = [];
  const stopFirst = repository.subscribe((rows) => { first = rows.map((row) => row.targetId); });
  const stopSecond = repository.subscribe((rows) => { second = rows.map((row) => row.targetId); });

  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(favoritesGets, 1, "concurrent subscribers must share one initial GET");
  assert.deepEqual(first, ["json-formatter"]);
  assert.deepEqual(second, ["json-formatter"]);

  await repository.toggle("tool", "yaml-formatter");
  assert.equal(togglePosts, 1, "toggle should issue one POST");
  assert.equal(favoritesGets, 2, "toggle should refresh once after the mutation");
  assert.deepEqual(first, ["json-formatter", "yaml-formatter"]);
  assert.deepEqual(second, ["json-formatter", "yaml-formatter"]);

  activeRows = [{ id: "b1", kind: "tool", target_id: "base64", created_at: "2026-10-02T00:00:00.000Z" }];
  repository.setUserScope("user-b");
  assert.deepEqual(await repository.list().then((rows) => rows.map((row) => row.targetId)), ["base64"]);
  assert.equal(favoritesGets, 3, "changing account must invalidate the previous user's cache");

  stopFirst();
  stopSecond();
  console.log("Favorites regression checks passed: shared initial request, update propagation, and user-scoped invalidation.");
} finally {
  globalThis.fetch = originalFetch;
}
