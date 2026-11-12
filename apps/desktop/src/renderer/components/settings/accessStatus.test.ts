import { expect, test } from "bun:test";
import type { AccessStatus } from "../../../shared/rpc-schema.ts";
import { createAccessStatusController, STOPPED_STATUS, type AccessAction } from "./accessStatus.ts";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

function sharing(token: string): AccessStatus {
  return { ...STOPPED_STATUS, local: { running: true, link: token, links: [token], clients: [] } };
}

function fixture() {
  const reads: ReturnType<typeof deferred<AccessStatus>>[] = [];
  const snapshots: { status: AccessStatus; busy?: AccessAction }[] = [];
  const controller = createAccessStatusController(() => {
    const request = deferred<AccessStatus>();
    reads.push(request);
    return request.promise;
  }, (status, busy) => snapshots.push({ status, busy }));
  return { controller, reads, snapshots };
}

for (const action of ["local", "replace", "revoke"] as const) {
  test(`an old poll cannot restore status after ${action}`, async () => {
    const { controller, reads, snapshots } = fixture();
    const old = controller.read();
    const next = action === "replace" ? sharing("new token") : STOPPED_STATUS;
    await controller.run(action, async () => next);
    reads[0]!.resolve(sharing("old token"));
    await old;
    expect(snapshots.at(-1)).toEqual({ status: next, busy: undefined });
  });
}

test("reversed polls keep the latest result, even if the old read fails", async () => {
  const { controller, reads, snapshots } = fixture();
  const first = controller.read();
  const second = controller.read();
  reads[1]!.resolve(sharing("new"));
  await second;
  reads[0]!.reject(new Error("old error"));
  await first;
  expect(snapshots).toEqual([{ status: sharing("new"), busy: undefined }]);
});

test("polls and duplicate actions do not start during a mutation; polling resumes afterwards", async () => {
  const { controller, reads, snapshots } = fixture();
  const action = deferred<AccessStatus>();
  const active = controller.run("replace", () => action.promise);
  await controller.read();
  let duplicate = false;
  await controller.run("revoke", async () => { duplicate = true; return STOPPED_STATUS; });
  expect(reads).toHaveLength(0);
  expect(duplicate).toBe(false);
  expect(snapshots.at(-1)?.busy).toBe("replace");
  action.resolve(sharing("new"));
  await active;
  const read = controller.read();
  reads[0]!.resolve(sharing("new"));
  await read;
  expect(snapshots.at(-1)).toEqual({ status: sharing("new"), busy: undefined });
});

test("mutation failure keeps the known links and settles busy with an error", async () => {
  const { controller, reads, snapshots } = fixture();
  const initial = controller.read();
  reads[0]!.resolve(sharing("known"));
  await initial;
  await controller.run("replace", () => { throw new Error("replace failed"); });
  expect(snapshots.at(-1)?.busy).toBeUndefined();
  expect(snapshots.at(-1)?.status.local.link).toBe("known");
  expect(snapshots.at(-1)?.status.local.error).toBe("replace failed");
});

test("unmount prevents pending reads and actions from publishing", async () => {
  const { controller, reads, snapshots } = fixture();
  const read = controller.read();
  const action = deferred<AccessStatus>();
  const run = controller.run("local", () => action.promise);
  const count = snapshots.length;
  controller.dispose();
  reads[0]!.resolve(sharing("old"));
  action.resolve(sharing("new"));
  await Promise.all([read, run]);
  await controller.read();
  expect(snapshots).toHaveLength(count);
  expect(reads).toHaveLength(1);
});
