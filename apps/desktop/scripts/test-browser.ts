/** Focused real-Electron integration check; no model credentials or personal data. */
import { build } from "esbuild";
import { build as buildRenderer } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
const root = await mkdtemp(join(tmpdir(), "nativepi-browser-"));
await mkdir(join(root, "out/main"), { recursive: true });
await mkdir(join(root, "out/preload"));
await writeFile(
  join(root, "package.json"),
  JSON.stringify({ type: "module", main: "out/main/test.mjs" }),
);
const entry = join(root, "test.ts");
await writeFile(
  entry,
  String.raw`
import {app, BrowserWindow} from 'electron';
import {createServer} from 'node:http';
import {strict as assert} from 'node:assert';
import {writeFile} from 'node:fs/promises';
import {SharedBrowser} from ${JSON.stringify(resolve("src/main/browser/index.ts"))};
app.setPath('userData',${JSON.stringify(join(root, "data"))});
process.on('uncaughtException', error=>{console.error(error);process.exit(1);});
app.whenReady().then(async () => {
const server = createServer((req,res) => { res.setHeader('Content-Type','text/html'); if(req.url === '/slow') return; res.end('<!doctype html><title>Browser verification</title><style>body{font:18px system-ui;padding:48px}button,input,select{font:inherit;margin:12px;padding:10px}h1{font-size:36px}</style><h1>Shared browser verification</h1><label>Name <input aria-label="Name"></label><button onclick="document.querySelector(\'h1\').textContent=\'Saved\'">Save</button><select aria-label="Color"><option value="blue">Blue</option><option value="green">Green</option></select><p>Local development page. Human and agent share this view.</p>'); });
server.listen(0,'127.0.0.1'); await new Promise(r => server.once('listening',r));
const url = 'http://127.0.0.1:'+server.address().port;
const a = new SharedBrowser(), b = new SharedBrowser();
try {
 console.log('open'); const opened = await a.run({action:'open',url}); const tab = opened.tab;
 assert.equal((await b.run({action:'list'})).tabs.length,0);
 await assert.rejects(b.run({action:'snapshot',tab}),/belong/);
 console.log('snapshot'); let snap = await a.run({action:'snapshot',tab});
 const input = snap.items.find(x=>x.name==='Name' && x.role==='input'); assert.ok(input);
 await a.run({action:'type',tab,ref:input.ref,text:'NativePi'});
 await assert.rejects(a.run({action:'click',tab,ref:input.ref}),/STALE/);
 snap = await a.run({action:'snapshot',tab});
 await a.run({action:'select',tab,ref:snap.items.find(x=>x.role==='select').ref,text:'green'});
 snap = await a.run({action:'snapshot',tab});
 await a.run({action:'click',tab,ref:snap.items.find(x=>x.role==='button').ref});
 assert.ok((await a.run({action:'snapshot',tab})).items.some(x=>x.name==='Saved'));
 const image = await a.run({action:'screenshot',tab}); assert.ok(Buffer.from(image.image.data,'base64').subarray(1,4).equals(Buffer.from('PNG')));
 const sibling = await a.run({action:'open',url});
 const backgroundImage = await a.run({action:'screenshot',tab}); assert.ok(Buffer.from(backgroundImage.image.data,'base64').subarray(1,4).equals(Buffer.from('PNG')));
 await a.run({action:'close',tab:sibling.tab});
 await a.run({action:'handoff',tab}); await assert.rejects(a.run({action:'snapshot',tab}),/handoff/);
 await a.chrome({action:'resume'});
 const chrome = BrowserWindow.getAllWindows().find(w=>w.contentView.children.some(v=>v.webContents?.getURL().startsWith(url)));
 await chrome.webContents.executeJavaScript(${JSON.stringify("new Promise((resolve,reject)=>{let n=0;const timer=setInterval(()=>{if(document.querySelector('input[aria-label=\"Address\"]')){clearInterval(timer);resolve(true);}else if(++n>100){clearInterval(timer);reject(new Error('Browser chrome failed to render'));}},50);})")});
 assert.equal(await chrome.webContents.executeJavaScript('document.querySelector("select") === null'),true);
 await chrome.webContents.executeJavaScript(${JSON.stringify("document.querySelector('button[aria-label=\"New tab\"]').click()")});
 await new Promise(r=>setTimeout(r,100));
 assert.equal(await chrome.webContents.executeJavaScript('document.body.innerText.includes("Open a page")'),true);
 await a.run({action:'show',tab});
 const page = BrowserWindow.getAllWindows().flatMap(w=>w.contentView.children).find(v=>v.webContents?.getURL().startsWith(url));
 assert.equal(await page.webContents.executeJavaScript('typeof require+":"+typeof process+":"+typeof window.nativepi'),'undefined:undefined:undefined');
 const fresh = await a.run({action:'snapshot',tab});
 await page.webContents.executeJavaScript('document.querySelector("input").setAttribute("placeholder","changed")');
 await assert.rejects(a.run({action:'click',tab,ref:fresh.items.find(x=>x.role==='button').ref}),/STALE/);
 console.log('cancel'); const stop = new AbortController(); const slow = a.run({action:'navigate',tab,url:url+'/slow'},stop.signal);
 const queued = a.run({action:'reload',tab}); queued.catch(()=>{}); setTimeout(()=>stop.abort(),100);
 await assert.rejects(slow); await assert.rejects(queued,/cancelled/);
 const other = await b.run({action:'open',url}); assert.ok(other.tab);
 await a.run({action:'navigate',tab,url});
 await a.run({action:'show',tab});
 console.log('PASS: ownership, input/select/click, stale refs, DOM mutation, screenshot, handoff, isolation, owner cancellation and queue fencing');
 if(process.env.NATIVEPI_BROWSER_CAPTURE) { console.log('Capture ready: '+tab); await new Promise(r=>setTimeout(r,45000)); }
 await a.run({action:'close',tab}); assert.equal((await a.run({action:'list'})).tabs.length,0);
} catch(e) { console.error(e); process.exitCode=1; }
finally { a.dispose(); b.dispose(); server.closeAllConnections(); server.close(); app.exit(process.exitCode||0); }
});
`,
);
try {
  await buildRenderer({
    configFile: false,
    root: resolve("src/renderer"),
    plugins: [react(), tailwindcss()],
    resolve: {
      dedupe: ["react", "react-dom"],
      alias: { "@": resolve("src/renderer") },
    },
    build: {
      emptyOutDir: true,
      outDir: join(root, "out/renderer"),
      rolldownOptions: { input: resolve("src/renderer/browser.html") },
    },
    logLevel: "warn",
    base: "./",
  });
  await build({
    entryPoints: [entry],
    outfile: join(root, "out/main/test.mjs"),
    bundle: true,
    platform: "node",
    format: "esm",
    external: ["electron"],
    banner: {
      js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
    },
  });
  await build({
    entryPoints: ["src/preload/browser.ts"],
    outfile: join(root, "out/preload/browser.cjs"),
    bundle: true,
    platform: "node",
    format: "cjs",
    external: ["electron"],
  });
  const electron = createRequire(import.meta.url)("electron");
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.ELECTRON_RENDERER_URL;
  const proc = Bun.spawn(
    [electron, root, "-ApplePersistenceIgnoreState", "YES"],
    {
      env,
      stdout: "inherit",
      stderr: "inherit",
    },
  );
  const code = await proc.exited;
  if (code) process.exitCode = code;
} finally {
  await rm(root, { recursive: true, force: true });
}
