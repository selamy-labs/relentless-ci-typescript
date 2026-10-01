import fc from "fast-check";
import { expect, test } from "vitest";
import { run } from "../src/cli.js";
import { consumerNode } from "../quality/consumer-command.js";

const seed = 20260929;
const strings = fc.string({ maxLength: 64 });
const malformed = fc.oneof(
  strings.map((value) => JSON.stringify(value).slice(0, -1)),
  strings.map((value) => "[" + JSON.stringify(value)),
  strings.map((value) => '{"value":' + JSON.stringify(value)),
  strings.map((value) => "[" + JSON.stringify(value) + ",]"),
);
const endpoint = fc.oneof(
  fc.boolean(),
  strings,
  fc.constant(null),
  fc.integer({ min: -1_000_000, max: 999_999 }).map((value) => value + 0.5),
);
const invalidIntervals = fc
  .tuple(endpoint, fc.boolean())
  .map(([value, first]) => JSON.stringify(first ? [[value, 0]] : [[0, value]]));
const families = [
  { name: "malformed JSON", inputs: malformed, message: "invalid JSON" },
  {
    name: "invalid typed endpoints",
    inputs: invalidIntervals,
    message: "endpoints must be integers",
  },
];

function rejection(message: string) {
  return { code: 2, stdout: "", stderr: `error: ${message}\n` };
}

test.each(families)(
  "bounded generated $name rejects through the public parser",
  ({ inputs, message }) => {
    fc.assert(
      fc.property(inputs, (input) => {
        expect(Buffer.byteLength(input, "utf8")).toBeLessThanOrEqual(512);
        expect(run(input)).toEqual(rejection(message));
      }),
      { seed, numRuns: 200 },
    );
  },
);

test.each(families)(
  "built executable terminates and explains generated $name",
  ({ inputs, message }) => {
    fc.assert(
      fc.property(inputs, (input) => {
        const expected = rejection(message);
        consumerNode(["dist/main.js"], process.cwd(), 10_000, input, {
          status: expected.code,
          stdout: expected.stdout,
          stderr: expected.stderr,
        });
      }),
      { seed, numRuns: 32 },
    );
  },
  30_000,
);
