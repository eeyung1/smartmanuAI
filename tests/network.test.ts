import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
test("fixture fetch guard rejects external destinations before invoking fetch and forbids redirects", () => {
  const result = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `
 import assert from 'node:assert/strict';
 let calls=0;
 globalThis.fetch=async (input,init)=>{calls++;assert.equal(init.redirect,'error');return new Response('local');};
 await import('./scripts/local-network-guard.mjs');
 for(const url of ['https://ai-gateway.vercel.sh/v1/models/catalog','https://example.com','http://127.0.0.1.example.com','file:///tmp/test']) await assert.rejects(fetch(url),/External fetch is disabled/);
 assert.equal(calls,0);
 await fetch('http://127.0.0.1:3101/health');
 assert.equal(calls,1);
 `,
    ],
    { encoding: "utf8", timeout: 10000 },
  );
  assert.equal(result.status, 0, result.stderr);
});
