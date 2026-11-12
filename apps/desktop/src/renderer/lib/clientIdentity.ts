/** getRandomValues remains available on HTTP Local Access; randomUUID does not. */
export function clientIdentity(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, "0")).join("");
}
