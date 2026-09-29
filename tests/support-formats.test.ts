import { expect, test } from "vitest";
import {
  verifyJson,
  verifyToml,
  verifyYaml,
} from "../quality/support-formats.js";

test.each([
  "null",
  "true",
  "42",
  '"text"',
  "[]",
  "{}",
  '{"a":{"a":1},"b":{"a":2}}',
  '[{"a":1},{"a":2}]',
  '{"0":{"a":1},"other":[{"a":2}]}',
  '{"a.b":1,"a":{"b":2}}',
  '{"a":{"x":1},"x":2}',
])("accepts strict JSON with independently scoped keys: %s", (text) => {
  expect(() => {
    verifyJson(text);
  }).not.toThrow();
});

test.each([
  '{"a":1,"a":2}',
  '{"a":{"b":1,"b":2}}',
  '[{"a":1,"a":2}]',
  '{"a":1,"\\u0061":2}',
  '{"a":{"x":1},"a":{"x":2}}',
])("rejects duplicate JSON keys: %s", (text) => {
  expect(() => {
    verifyJson(text);
  }).toThrow("duplicate JSON object key");
});

test.each([
  "",
  " ",
  "{",
  "{} {}",
  '{"a":1,}',
  "[1,]",
  "/*comment*/{}",
  "//comment\n{}",
])("rejects invalid strict JSON syntax: %j", (text) => {
  expect(() => {
    verifyJson(text);
  }).toThrow("invalid strict JSON syntax");
});

test.each([
  "name: Clean\n",
  "on: [push]\n",
  "a: {x: 1}\nb: {x: 2}\n",
  "- one\n- two\n",
])("accepts strict YAML: %j", (text) => {
  expect(() => {
    verifyYaml(text);
  }).not.toThrow();
});

test.each([
  "",
  "# comment\n",
  "a: [",
  "a: 1\na: 2\n",
  "a: 1\n'a': 2\n",
  "a: &value one\nb: *value\n",
  "a: *unknown\n",
  "a: !unsupported one\n",
  "a: 1\n---\nb: 2\n",
  "? [a, b]\n: value\n",
  '1: value\n"1": other\n',
])("rejects malformed, ambiguous or empty YAML: %j", (text) => {
  expect(() => {
    verifyYaml(text);
  }).toThrow();
});

test.each([
  "",
  "# comment\n",
  "name = 'clean'\n",
  "[a]\nx = 1\n[b]\nx = 2\n",
  "items = [{a=1}, {a=2}]\n",
])(
  "accepts strict TOML including intentional empty configurations: %j",
  (text) => {
    expect(() => {
      verifyToml(text);
    }).not.toThrow();
  },
);

test.each(["a = [", "a = 1\na = 2\n", "a.b = 1\n[a]\nb = 2\n"])(
  "rejects malformed or duplicate TOML: %j",
  (text) => {
    expect(() => {
      verifyToml(text);
    }).toThrow();
  },
);
