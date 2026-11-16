import { expect, test } from "bun:test";
import { runInNewContext } from "node:vm";
import { browserActionScript } from "./actionScript.ts";

test("browser action strings remain data and round-trip through script execution", () => {
  const ref = 'generation:<ref>"\\\u2028\u2029';
  const text = `</script><script>globalThis.injected = true</script><!--\u2028\u2029\n\r\t\b\f\0"\\'); globalThis.injected = true; //`;
  const code = browserActionScript({ ref, action: "type", text });
  // These must be escaped even though direct JS execution has no HTML parser.
  expect(code).not.toMatch(/[<\u2028\u2029]/);
  expect(code).toContain("\\u003cref\\u003e");
  let received: unknown;
  const context = {
    injected: false,
    nativepiBrowser: {
      act: (...args: unknown[]) => {
        received = args;
        return "delivered";
      },
    },
  };
  const result = runInNewContext(code, context);
  expect(received).toEqual([ref, "type", text]);
  expect(result.value).toBe("delivered");
  expect(context.injected).toBe(false);
});

test("click preserves omitted text as undefined", () => {
  const result = runInNewContext(
    browserActionScript({ ref: "generation:1", action: "click" }),
    { nativepiBrowser: { act: (...args: unknown[]) => args } },
  );
  expect(result.value).toEqual(["generation:1", "click", undefined]);
});

test("page action errors remain bounded data", () => {
  const result = runInNewContext(
    browserActionScript({ ref: "generation:1", action: "select", text: "value" }),
    { nativepiBrowser: { act: () => { throw new Error("x".repeat(2000)); } } },
  );
  expect(result.error).toBe("Error: " + "x".repeat(993));
  expect(result.value).toBeUndefined();
});
