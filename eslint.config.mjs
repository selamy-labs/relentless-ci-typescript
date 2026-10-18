import js from "@eslint/js";
import tseslint from "typescript-eslint";
import sonarjs from "eslint-plugin-sonarjs";
import vitest from "@vitest/eslint-plugin";
import { ESLintUtils } from "@typescript-eslint/utils";
import { sep } from "node:path";
import policy from "./quality/eslint-policy.json" with { type: "json" };

/** @typedef {import("typescript").Declaration} Declaration */
/** @typedef {import("@typescript-eslint/utils").TSESTree.ObjectExpression} ObjectExpression */
/** @typedef {import("@typescript-eslint/utils").TSESTree.Property} Property */
/** @typedef {import("@typescript-eslint/utils").TSESTree.MemberExpression} MemberExpression */

/** @param {readonly Declaration[] | undefined} declarations */
function vitestDeclaration(declarations) {
  return (
    declarations?.some((declaration) =>
      declaration
        .getSourceFile()
        .fileName.split(sep)
        .join("/")
        .includes("/node_modules/vitest/"),
    ) ?? false
  );
}

const modifiers = new Set(["only", "skip", "todo", "fails", "skipIf", "runIf"]);
const defaults = new Map([
  ["retry", "0"],
  ["repeats", "0"],
  ["only", "false"],
  ["skip", "false"],
  ["todo", "false"],
  ["fails", "false"],
]);

/** @type {import("@typescript-eslint/utils").TSESLint.RuleModule<"shortcut", []>} */
const testExecution = {
  meta: {
    type: "problem",
    schema: [],
    messages: {
      shortcut:
        "Vitest tests must run once, unconditionally, and pass normally.",
    },
  },
  defaultOptions: [],
  create(context) {
    const services = ESLintUtils.getParserServices(context);
    const checker = services.program.getTypeChecker();

    /** @param {Property} property */
    function propertyName(property) {
      if (!property.computed && property.key.type === "Identifier") {
        return property.key.name;
      }
      if (
        property.key.type === "Literal" &&
        typeof property.key.value === "string"
      ) {
        return property.key.value;
      }
      const key = services.getTypeAtLocation(property.key);
      return key.isStringLiteral() ? key.value : undefined;
    }

    /** @param {MemberExpression} node */
    function memberSymbol(node) {
      const symbol = services.getSymbolAtLocation(node);
      if (symbol) {
        return symbol;
      }
      const key = services.getTypeAtLocation(node.property);
      return key.isStringLiteral()
        ? checker.getPropertyOfType(
            services.getTypeAtLocation(node.object),
            key.value,
          )
        : undefined;
    }

    /** @param {import("@typescript-eslint/utils").TSESTree.Node} node
     * @param {import("typescript").Symbol | undefined} symbol
     * @param {import("typescript").Type} type */
    function reference(node, symbol, type) {
      if (
        !symbol ||
        !modifiers.has(symbol.name) ||
        !vitestDeclaration(symbol.declarations)
      ) {
        return;
      }
      if (type.getCallSignatures().length > 0) {
        context.report({ node, messageId: "shortcut" });
      }
    }

    /** @param {Property} property @param {import("typescript").Type} type */
    function binding(property, type) {
      const name = propertyName(property);
      if (name) {
        reference(
          property,
          checker.getPropertyOfType(type, name),
          services.getTypeAtLocation(property.value),
        );
      }
    }

    /** @param {ObjectExpression} node */
    function options(node) {
      const native = services.esTreeNodeToTSNodeMap.get(node);
      // Only call arguments and a native configuration member reach this helper.
      // The pinned checker supplies their contextual type; losing it must fail
      // rather than substitute the object's unrelated inferred property owners.
      const contextual = /** @type {import("typescript").Type} */ (
        checker.getContextualType(native)
      );
      const type = checker.getNonNullableType(contextual);
      for (const property of node.properties) {
        if (property.type === "Property") {
          option(property, type);
        }
      }
    }

    /** @param {Property} property @param {import("typescript").Type} type */
    function option(property, type) {
      const name = propertyName(property);
      if (
        !name ||
        !vitestDeclaration(checker.getPropertyOfType(type, name)?.declarations)
      ) {
        return;
      }
      if (name === "test" && property.value.type === "ObjectExpression") {
        options(property.value);
      }
      const expected = defaults.get(name);
      if (
        expected !== undefined &&
        checker.typeToString(services.getTypeAtLocation(property.value)) !==
          expected
      ) {
        context.report({ node: property, messageId: "shortcut" });
      }
    }

    return {
      MemberExpression(node) {
        reference(node, memberSymbol(node), services.getTypeAtLocation(node));
      },
      ObjectPattern(node) {
        const type = services.getTypeAtLocation(node);
        for (const property of node.properties) {
          if (property.type === "Property") {
            binding(property, type);
          }
        }
      },
      CallExpression(node) {
        const signatures = services
          .getTypeAtLocation(node.callee)
          .getCallSignatures();
        if (
          !signatures.some((signature) =>
            vitestDeclaration([signature.getDeclaration()]),
          )
        ) {
          return;
        }
        for (const argument of node.arguments) {
          if (argument.type === "ObjectExpression") {
            options(argument);
          }
        }
      },
    };
  },
};

export default [
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  ...policy,
  { plugins: { sonarjs } },
  {
    files: ["**/*.ts"],
    plugins: { relentless: { rules: { "test-execution": testExecution } } },
    rules: { "relentless/test-execution": "error" },
  },
  { files: ["tests/**/*.ts"], plugins: { vitest } },
  { files: ["**/*.mjs"], ...tseslint.configs.disableTypeChecked },
];
