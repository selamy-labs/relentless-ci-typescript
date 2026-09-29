import { visit } from "jsonc-parser";
import { parse } from "smol-toml";
import { parseDocument } from "yaml";
import { z } from "zod";

export function verifyJson(text: string): void {
  const properties = new Set<string>();
  visit(
    text,
    {
      onObjectProperty: (name, _offset, _length, _line, _column, path) => {
        const key = JSON.stringify([...path(), name]);
        if (properties.has(key)) {
          throw new Error("duplicate JSON object key");
        }
        properties.add(key);
      },
      onError: () => {
        throw new Error("invalid strict JSON syntax");
      },
    },
    { disallowComments: true },
  );
}

export function verifyYaml(text: string): void {
  const document = parseDocument(text, { stringKeys: true });
  z.array(z.never()).parse([...document.errors, ...document.warnings]);
  document.toJS({ maxAliasCount: 0 });
  z.unknown()
    .refine((value) => value !== null)
    .parse(document.contents);
}

export function verifyToml(text: string): void {
  parse(text);
}
