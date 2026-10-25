// In-process tests: `pretest` bundles src/index.ts with the SDK external, so the plugin and the
// harness share one SDK. Run: npm test (or bun run test).
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const { app } = require("../dist/plugin.cjs");
const { Harness } = require("astra-plugin-sdk/testing");

test("anim_studio_list answers with a JSON list", async () => {
  const h = await Harness.create(app).start();
  assert.deepEqual(await h.toolNames(), ["anim_studio_list"]);
  const r = await h.callTool("anim_studio_list", {});
  assert.equal(r.success, true);
  assert.ok(Array.isArray(JSON.parse(r.result)));
});

test("no config the daemon can deliver crashes this plugin", async () => {
  const h = await Harness.create(app).start();
  assert.deepEqual(await h.fuzzConfig(), []);
});
