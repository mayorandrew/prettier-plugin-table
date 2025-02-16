/**
 * @file
 * This file contains functions copied from the various places of prettier source code,
 * because we need to use them in our code, and they are not exported.
 */

import { TSESTree } from "@typescript-eslint/types";
import { AstPath, Doc, ParserOptions } from "prettier";

// Copied from prettier source code
// https://github.com/prettier/prettier/blob/e5a75f59692d1e42be8334518b4cee715b9d9ea8/src/language-js/utils/index.js#L687
export function shouldPrintComma(options: any, level = "es5") {
  return (
    (options.trailingComma === "es5" && level === "es5") ||
    (options.trailingComma === "all" && (level === "all" || level === "es5"))
  );
}

const skipChainExpression =
  (fn: (node: TSESTree.Node) => boolean) => (node: TSESTree.Node) => {
    if (node?.type === "ChainExpression") {
      node = node.expression;
    }

    return fn(node);
  };

function createTypeCheckFunction(typesArray: string[]) {
  const types = new Set(typesArray);
  return (node: TSESTree.Node | TSESTree.Comment) => types.has(node?.type);
}

export const isCallExpression = skipChainExpression(
  createTypeCheckFunction(["CallExpression", "OptionalCallExpression"]),
);
export const isMemberExpression = skipChainExpression(
  createTypeCheckFunction(["MemberExpression", "OptionalMemberExpression"]),
);

// Copied from prettier source code
// https://github.com/prettier/prettier/blob/71b8a24e7f1abe4b659d81f40b17913cb559dcb4/src/language-js/print/misc.js#L14-L32
export function printOptionalToken(path: AstPath): Doc {
  const { node } = path;
  if (
    !node.optional ||
    // It's an optional computed method parsed by typescript-estree.
    // "?" is printed in `printMethod`.
    (node.type === "Identifier" && node === path.parent.key)
  ) {
    return "";
  }
  if (
    isCallExpression(node) ||
    (isMemberExpression(node) && node.computed) ||
    node.type === "OptionalIndexedAccessType"
  ) {
    return "?.";
  }
  return "?";
}

export function printFunctionTypeParameters(
  path: AstPath,
  options: ParserOptions,
  print: (path: AstPath) => Doc,
): Doc {
  const fun = path.node;
  if (fun.typeArguments) {
    return print("typeArguments" as any);
  }
  if (fun.typeParameters) {
    return print("typeParameters" as any);
  }
  return "";
}

// Coped from prettier sources
export interface PrintedDoc {
  formatted: string;
  /**
   * This property is a misnomer, and has been since the changes in
   * https://github.com/prettier/prettier/pull/15709.
   * The region of the document indicated by `cursorNodeStart` and `cursorNodeText` will
   * sometimes actually be what lies BETWEEN a pair of leaf nodes in the AST, rather than a node.
   */
  cursorNodeStart?: number | undefined;

  /**
   * Note that, like cursorNodeStart, this is a misnomer and may actually be the text between two
   * leaf nodes in the AST instead of the text of a node.
   */
  cursorNodeText?: string | undefined;
}
