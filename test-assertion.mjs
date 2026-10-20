import { ESLintUtils } from "@typescript-eslint/utils";
import { sep } from "node:path";
import ts from "typescript";

/** @typedef {import("typescript").Declaration} Declaration */
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
export function vitestDeclaration(declarations) {
  return declaredIn(declarations, "/node_modules/vitest/");
}

/** @param {ts.CallExpression} call @param {string} name */
function counted(call, name) {
  const [count] = call.arguments;
  return (
    name === "hasAssertions" ||
    (name === "assertions" &&
      count !== undefined &&
      ts.isNumericLiteral(count) &&
      Number(count.text) > 0)
  );
}

/** @type {Pick<AssertionRule, "create"> & { meta: import("eslint").Rule.RuleMetaData }} */
export const testAssertion = {
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
      if (!ts.isPropertyAccessExpression(callee)) {
        return false;
      }
      if (typed(callee.expression, "ExpectStatic")) {
        return counted(call, callee.name.text);
      }
      return (
        expectation(callee.expression) &&
        vitestDeclaration(target(callee)?.declarations)
      );
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
      if (
        symbol?.name === "assert" &&
        declaredIn(symbol.declarations, "/node_modules/fast-check/")
      ) {
        return property(call.arguments[0]);
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
      return ts.forEachChild(node, visit) === true;
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
      return ts.isFunctionLike(value) && body(value);
    }

    /** @param {ts.Expression} node @returns {boolean} */
    function reaches(node) {
      if (ts.isFunctionLike(node)) {
        return body(node);
      }
      return target(node)?.declarations?.some(local) === true;
    }

    // Every supported Vitest registration overload names its body parameter
    // `fn`; titles, options and `each`/`for` tables never count as the body.
    // The checker resolves a signature for every parsed call expression; it
    // returns undefined only for synthesized nodes outside the program.
    /** @param {ts.CallExpression} call */
    function testBody(call) {
      const { parameters } = /** @type {ts.Signature} */ (
        checker.getResolvedSignature(call)
      );
      return call.arguments.find(
        (_argument, index) => parameters[index]?.name === "fn",
      );
    }

    return {
      CallExpression(node) {
        const call = services.esTreeNodeToTSNodeMap.get(node);
        if (!testApi(call.expression)) {
          return;
        }
        const fn = testBody(call);
        if (fn !== undefined && !reaches(fn)) {
          context.report({ node, messageId: "missing" });
        }
      },
    };
  },
};
