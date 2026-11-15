import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { request } from "node:http";
import { networkInterfaces } from "node:os";

// Run against the dev server: this upgrade is required for its client to initialize.
const address = Object.values(networkInterfaces()).flat().find(entry => entry?.family === "IPv4" && !entry.internal)?.address;
const target = process.argv[2] ?? (address ? `http://${address}:3000` : null);
assert.ok(target, "Pass the LAN preview URL when no external IPv4 interface is available.");
const origin = new URL(target);
assert.equal(origin.protocol, "http:", "Use the local HTTP development URL.");

await new Promise((resolve, reject) => {
  const req = request(new URL("/_next/hmr?id=nativepi-lan-check", origin), {
    headers: {
      Origin: origin.origin,
      Connection: "Upgrade",
      Upgrade: "websocket",
      "Sec-WebSocket-Version": "13",
      "Sec-WebSocket-Key": randomBytes(16).toString("base64"),
    },
  });
  req.setTimeout(5000, () => req.destroy(new Error("The LAN development connection timed out.")));
  req.on("upgrade", (response, socket) => {
    req.setTimeout(0);
    socket.destroy();
    try { assert.equal(response.statusCode, 101); resolve(); }
    catch (error) { reject(error); }
  });
  req.on("response", response => {
    response.resume();
    reject(new Error(`The dev server refused the LAN upgrade: HTTP ${response.statusCode}.`));
  });
  req.on("error", reject);
  req.end();
});

console.log(`PASS: the development connection accepts ${origin.origin}.`);
