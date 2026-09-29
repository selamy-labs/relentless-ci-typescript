import { EventEmitter } from "node:events";
import { expect, test } from "vitest";
import { installWarningGuard } from "../quality/warning-guard.js";

function registration(source: EventEmitter, settle: () => Promise<unknown>) {
  const finalizers: (() => Promise<void>)[] = [];
  installWarningGuard(source, (finalize) => finalizers.push(finalize), settle);
  expect(finalizers).toHaveLength(1);
  const finalize = finalizers[0];
  if (!finalize) throw new Error("missing finalizer");
  return finalize;
}

test("warning guard raises the original diagnostic and preserves foreign listeners", async () => {
  const source = new EventEmitter();
  const warnings: Error[] = [];
  const foreign = (warning: Error) => {
    warnings.push(warning);
  };
  source.on("warning", foreign);
  let settled = 0;
  const finalize = registration(source, () => {
    settled++;
    return Promise.resolve();
  });
  const warning = new Error("native diagnostic");
  expect(() => {
    source.emit("warning", warning);
  }).toThrow(warning);
  expect(warnings).toEqual([warning]);
  expect(source.listenerCount("warning")).toBe(2);
  await finalize();
  expect(settled).toBe(1);
  expect(source.listeners("warning")).toEqual([foreign]);
  expect(source.emit("warning", warning)).toBe(true);
  expect(warnings).toEqual([warning, warning]);
  await finalize();
  expect(settled).toBe(2);
  expect(source.listeners("warning")).toEqual([foreign]);
});

test("independent registrations drain before removing only their own listeners", async () => {
  const source = new EventEmitter();
  let release: () => void = () => {
    throw new Error("unregistered release");
  };
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const first = registration(source, () => pending);
  const second = registration(source, () => Promise.resolve());
  const completing = first();
  expect(source.listenerCount("warning")).toBe(2);
  expect(() => {
    source.emit("warning", new Error("queued"));
  }).toThrow("queued");
  await second();
  expect(source.listenerCount("warning")).toBe(1);
  expect(() => {
    source.emit("warning", new Error("first still owns"));
  }).toThrow("first still owns");
  release();
  await completing;
  expect(source.listenerCount("warning")).toBe(0);
  expect(source.emit("warning", new Error("after cleanup"))).toBe(false);
});

test("a failed drain removes ownership and propagates the failure", async () => {
  const source = new EventEmitter();
  const failure = new Error("drain failed");
  const finalize = registration(source, () => Promise.reject(failure));
  await expect(finalize()).rejects.toBe(failure);
  expect(source.listenerCount("warning")).toBe(0);
});

test("registration failures remove the owned listener and propagate", () => {
  const source = new EventEmitter();
  const foreign = () => undefined;
  source.on("warning", foreign);
  const failure = new Error("finalizer registration failed");
  expect(() => {
    installWarningGuard(
      source,
      () => {
        throw failure;
      },
      () => Promise.resolve(),
    );
  }).toThrow(failure);
  expect(source.listeners("warning")).toEqual([foreign]);
});
