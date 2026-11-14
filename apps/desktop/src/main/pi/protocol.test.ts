import { expect, test } from "bun:test";
import { drainLines, serializeCommand } from "./protocol.ts";

function feed(chunks: string[]): unknown[] {
  let buffer = "";
  const out: unknown[] = [];
  for (const chunk of chunks) {
    buffer += chunk;
    const { messages, rest } = drainLines(buffer);
    buffer = rest;
    out.push(...messages);
  }
  return out;
}

test("parses a complete line", () => {
  const msgs = feed(['{"type":"response","command":"prompt","success":true}\n']);
  expect(msgs).toEqual([{ type: "response", command: "prompt", success: true }]);
});

test("reassembles a message split across chunk boundaries", () => {
  const line = '{"type":"message_update","assistantMessageEvent":{"type":"text_delta","contentIndex":0,"delta":"hi"}}\n';
  const mid = Math.floor(line.length / 2);
  const msgs = feed([line.slice(0, mid), line.slice(mid)]);
  expect(msgs).toHaveLength(1);
  expect((msgs[0] as { assistantMessageEvent: { type: "text_delta"; contentIndex: number; delta: string } }).assistantMessageEvent).toEqual({
    type: "text_delta",
    contentIndex: 0,
    delta: "hi",
  });
});

test("emits multiple messages from one chunk and holds a trailing partial", () => {
  const msgs = feed(['{"type":"a"}\n{"type":"b"}\n{"type":"c', '"}\n']);
  expect(msgs.map((m: any) => m.type)).toEqual(["a", "b", "c"]);
});

test("does not split on U+2028/U+2029 inside a JSON string (LF-only framing)", () => {
  const text = "a" + String.fromCharCode(0x2028) + "b" + String.fromCharCode(0x2029) + "c";
  const msgs = feed([JSON.stringify({ type: "x", text }) + "\n"]);
  expect(msgs).toHaveLength(1);
  expect((msgs[0] as any).text).toBe(text);
});

test("skips non-JSON noise and messages missing a string type", () => {
  const msgs = feed(["not json\nnull\n42\n[]\n", '{"nope":1}\n', '{"type":42}\n', '{"type":"future_event","future":{"retained":true}}\n']);
  expect(msgs).toEqual([{ type: "future_event", future: { retained: true } }]);
});

test("serializeCommand appends exactly one LF", () => {
  expect(serializeCommand({ type: "abort" })).toBe('{"type":"abort"}\n');
});
