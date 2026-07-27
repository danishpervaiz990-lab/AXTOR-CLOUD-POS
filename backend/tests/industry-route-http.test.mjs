import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL ||= "postgresql://axtor:axtor@127.0.0.1:5432/axtor_test";
process.env.AUTH_TOKEN_SECRET ||= "test-only-secret-with-at-least-thirty-two-characters";

const { createApp } = await import("../dist/app.js");
const releasedRoutes = ["gym", "school", "clinic", "restaurant", "hardware", "paint", "furniture", "workshop", "wholesale"];

test("released industry HTTP routes exist and require authentication", async (context) => {
  const server = createServer(createApp());
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const address = server.address();
  const origin = `http://127.0.0.1:${address.port}`;

  for (const industry of releasedRoutes) {
    const response = await fetch(`${origin}/api/v1/${industry}/dashboard`);
    assert.equal(response.status, 401, `${industry} route should exist and reject an anonymous request`);
    const body = await response.json();
    assert.equal(body.error?.message, "Authentication required");
  }
});
