import js from "@eslint/js";
import tseslint from "typescript-eslint";
import sonarjs from "eslint-plugin-sonarjs";
import vitest from "@vitest/eslint-plugin";
import { ESLintUtils } from "@typescript-eslint/utils";
import { sep } from "node:path";
import ts from "typescript";
import policy from "./quality/eslint-policy.json" with { type: "json" };

/** @typedef {import("typescript").Declaration} Declaration */
/** @typedef {import("@typescript-eslint/utils").TSESTree.ObjectExpression} ObjectExpression */
/** @typedef {import("@typescript-eslint/utils").TSESTree.Property} Property */
/** @typedef {import("@typescript-eslint/utils").TSESTree.MemberExpression} MemberExpression */
/** @typedef {import("@typescript-eslint/utils").TSESLint.RuleModule<"shortcut", []>} TypedRule */
/** @typedef {import("@typescript-eslint/utils").TSESLint.RuleModule<"missing", []>} AssertionRule */

/** @param {readonly Declaration[] | undefined} declarations
 * @param {string} directory */
function declaredIn(declarations, directory) {
  return (
    declarations?.some((declaration) =>
      declaration
        .getSourceFile()
        .fileName.split(sep)
        .join("/")
        .includes(directory),
    ) ?? false
  );
}

/** @param {readonly Declaration[] | undefined} declarations */
function vitestDeclaration(declarations) {
  return declaredIn(declarations, "/node_modules/vitest/");
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

/** @type {Pick<TypedRule, "create"> & { meta: import("eslint").Rule.RuleMetaData }} */
const testExecution = {
  meta: {
    schema: [],
    messages: {
      shortcut:
        "Vitest tests must run once, unconditionally, and pass normally.",
    },
  },
  create(context) {
    const services = ESLintUtils.getParserServices(context);
    const checker = services.program.getTypeChecker();

    /** @param {Property} property */
    function propertyName(property) {
      switch (property.key.type) {
        case "Identifier":
          return property.computed ? typedKey(property.key) : property.key.name;
        case "Literal":
          return String(property.key.value);
        default:
          return typedKey(property.key);
      }
    }

    /** @param {import("@typescript-eslint/utils").TSESTree.Node} node */
    function typedKey(node) {
      const key = services.getTypeAtLocation(node);
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
      if (property.value.type === "ObjectExpression") {
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

const counters = new Set(["assertions", "hasAssertions"]);

/** @type {Pick<AssertionRule, "create"> & { meta: import("eslint").Rule.RuleMetaData }} */
const testAssertion = {
  meta: {
    schema: [],
    messages: {
      missing:
        "Vitest tests must reach an assertion that no catch block swallows.",
    },
  },
  create(context) {
    const services = ESLintUtils.getParserServices(context);
    const checker = services.program.getTypeChecker();
    /** @type {Map<ts.SignatureDeclaration, boolean>} */
    const results = new Map();

    /** @param {ts.Node} node @param {string} name */
    function typed(node, name) {
      const type = checker.getTypeAtLocation(node);
      const symbol = type.aliasSymbol ?? type.getSymbol();
      return symbol?.name === name && vitestDeclaration(symbol.declarations);
    }

    /** @param {ts.Node} node @returns {boolean} */
    function chained(node) {
      return ts.isCallExpression(node) || ts.isPropertyAccessExpression(node);
    }

    /** @param {ts.Expression} node @returns {boolean} */
    function testApi(node) {
      return (
        typed(node, "TestAPI") ||
        (chained(node) &&
          testApi(/** @type {ts.CallExpression} */ (node).expression))
      );
    }

    /** @param {ts.Expression} node @returns {boolean} */
    function expectation(node) {
      if (ts.isCallExpression(node) && typed(node.expression, "ExpectStatic")) {
        return true;
      }
      return (
        chained(node) &&
        expectation(/** @type {ts.CallExpression} */ (node).expression)
      );
    }

    /** @param {ts.Expression} node */
    function target(node) {
      const symbol = checker.getSymbolAtLocation(
        ts.isPropertyAccessExpression(node) ? node.name : node,
      );
      return symbol && symbol.flags & ts.SymbolFlags.Alias
        ? checker.getAliasedSymbol(symbol)
        : symbol;
    }

    /** @param {ts.CallExpression} call */
    function terminal(call) {
      const callee = call.expression;
      if (ts.isPropertyAccessExpression(callee)) {
        return counters.has(callee.name.text)
          ? typed(callee.expression, "ExpectStatic")
          : expectation(callee.expression);
      }
      return false;
    }

    /** @param {ts.Expression | undefined} node */
    function property(node) {
      return (
        node !== undefined &&
        ts.isCallExpression(node) &&
        node.arguments.some(reaches)
      );
    }

    /** @param {ts.CallExpression} call */
    function asserts(call) {
      const symbol = target(call.expression);
      if (
        terminal(call) ||
        declaredIn(symbol?.declarations, "/node_modules/@types/node/assert")
      ) {
        return true;
      }
      if (declaredIn(symbol?.declarations, "/node_modules/fast-check/")) {
        return symbol?.name === "assert" && property(call.arguments[0]);
      }
      return reaches(call.expression);
    }

    /** @param {ts.CatchClause | undefined} clause */
    function swallows(clause) {
      return (
        clause !== undefined &&
        clause.block.statements.at(-1)?.kind !== ts.SyntaxKind.ThrowStatement
      );
    }

    /** @param {ts.Node} node @returns {boolean} */
    function visit(node) {
      if (ts.isFunctionLike(node)) {
        return false;
      }
      if (ts.isTryStatement(node)) {
        return attempt(node);
      }
      return (ts.isCallExpression(node) && asserts(node)) || children(node);
    }

    /** @param {ts.TryStatement} node */
    function attempt(node) {
      if (!swallows(node.catchClause)) {
        return children(node);
      }
      return node.finallyBlock !== undefined && visit(node.finallyBlock);
    }

    /** @param {ts.Node} node */
    function children(node) {
      return ts.forEachChild(node, visit) ?? false;
    }

    /** @param {ts.SignatureDeclaration} declaration */
    function body(declaration) {
      if (!results.has(declaration)) {
        results.set(declaration, false);
        const block = /** @type {{ body?: ts.Node }} */ (declaration).body;
        results.set(declaration, block !== undefined && visit(block));
      }
      return results.get(declaration) === true;
    }

    /** @param {ts.Declaration} declaration */
    function local(declaration) {
      const value = ts.isVariableDeclaration(declaration)
        ? declaration.initializer
        : declaration;
      return (
        value !== undefined &&
        ts.isFunctionLike(value) &&
        !declaration.getSourceFile().isDeclarationFile &&
        body(value)
      );
    }

    /** @param {ts.Expression} node @returns {boolean} */
    function reaches(node) {
      if (ts.isFunctionLike(node)) {
        return body(node);
      }
      return (target(node)?.declarations ?? []).some(local);
    }

    /** @param {ts.Expression} node */
    function callable(node) {
      return checker.getTypeAtLocation(node).getCallSignatures().length > 0;
    }

    return {
      CallExpression(node) {
        const call = services.esTreeNodeToTSNodeMap.get(node);
        const callbacks = call.arguments.filter(callable);
        if (callbacks.length === 0 || !testApi(call.expression)) {
          return;
        }
        if (!callbacks.some(reaches)) {
          context.report({ node, messageId: "missing" });
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
    plugins: {
      relentless: {
        rules: {
          "test-execution": testExecution,
          "test-assertion": testAssertion,
        },
      },
    },
    rules: { "relentless/test-execution": "error" },
  },
  {
    files: ["tests/**/*.ts"],
    plugins: { vitest },
    rules: { "relentless/test-assertion": "error" },
  },
  { files: ["**/*.mjs"], ...tseslint.configs.disableTypeChecked },
];
