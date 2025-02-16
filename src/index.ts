import {
  AstPath,
  Doc,
  Parser,
  ParserOptions,
  Printer,
  SupportLanguage,
} from "prettier";
import * as parserTypescript from "prettier/parser-typescript";
import * as estree from "prettier/plugins/estree.js";
import type { TSESTreeOptions } from "@typescript-eslint/typescript-estree";
import {
  AST,
  AST_TOKEN_TYPES,
  simpleTraverse,
} from "@typescript-eslint/typescript-estree";
import { AST_NODE_TYPES, TSESTree } from "@typescript-eslint/types";
import { builders as pb, printer } from "prettier/doc";
import {
  PrintedDoc,
  printFunctionTypeParameters,
  printOptionalToken,
  shouldPrintComma,
} from "./prettier-utils.js";

export const languages: SupportLanguage[] = [
  {
    name: "typescript",
    parsers: ["typescript"],
  },
];

const tableSymbol = Symbol("isTable");

export const parsers = {
  typescript: ((): Parser => ({
    ...parserTypescript.parsers.typescript,
    parse: (text: string, options: any) => {
      const ast: AST<TSESTreeOptions> =
        parserTypescript.parsers.typescript.parse(text, options);

      // fs.writeFileSync('debug_ast.json', JSON.stringify(ast, null, 2));

      if (!ast.comments) return ast;

      const hasPrevLineTableComment = (node: TSESTree.Node) => {
        const nodeLine = node.loc.start.line;
        const prevComment = ast.comments?.find(
          (comment) =>
            comment.type === AST_TOKEN_TYPES.Line &&
            comment.loc.start.line === comment.loc.end.line &&
            comment.loc.end.line === nodeLine - 1,
        );

        if (!prevComment) return false;
        return prevComment.value.split(/\s+/).includes("prettier-table");
      };

      const checkIsTable = (
        node: TSESTree.Node,
        elements: (TSESTree.Node | null)[],
      ) => {
        const isTable = elements.every(
          (element) =>
            element && element.type === AST_NODE_TYPES.ArrayExpression,
        );
        if (!isTable) return false;
        return hasPrevLineTableComment(node);
      };

      simpleTraverse(ast, {
        visitors: {
          ArrayExpression: (node: TSESTree.Node) => {
            if (node.type !== AST_NODE_TYPES.ArrayExpression) return;
            if (!checkIsTable(node, node.elements)) return;
            (node as any)[tableSymbol] = true;
          },
          CallExpression: (node: TSESTree.Node) => {
            if (node.type !== AST_NODE_TYPES.CallExpression) return;
            if (!checkIsTable(node, node.arguments)) return;
            (node as any)[tableSymbol] = true;
          },
        },
      });

      return ast;
    },
  }))(),
} satisfies Record<string, Parser>;

const removeLineBreaks = (element: Doc): Doc | null => {
  if (typeof element === "string") return element;
  if (Array.isArray(element))
    return element.map(removeLineBreaks).filter((element) => element !== null);

  switch (element.type) {
    case "align": {
      const contents = removeLineBreaks(element.contents);
      if (!contents) return null;
      return { ...element, contents };
    }
    case "break-parent": {
      return null;
    }
    case "fill": {
      const parts = element.parts
        .map(removeLineBreaks)
        .filter((element) => element !== null);
      if (parts.length === 0) return null;
      return { ...element, parts };
    }
    case "group": {
      const contents = removeLineBreaks(element.contents);
      if (!contents) return null;
      const expandedStates = element.expandedStates
        ?.map(removeLineBreaks)
        .filter((element) => element !== null);
      return { ...element, break: false, contents, expandedStates };
    }
    case "if-break": {
      return removeLineBreaks(element.flatContents);
    }
    case "indent": {
      const contents = removeLineBreaks(element.contents);
      if (!contents) return null;
      return { ...element, contents };
    }
    case "label": {
      const contents = removeLineBreaks(element.contents);
      if (!contents) return null;
      return { ...element, contents };
    }
    case "line": {
      if (!element.literal) return null;
      return element;
    }
    case "line-suffix": {
      const contents = removeLineBreaks(element.contents);
      if (!contents) return null;
      return { ...element, contents };
    }
    default: {
      return element;
    }
  }
};

export const printers = {
  estree: ((): Printer => ({
    ...estree.printers.estree,
    print: function (
      path: AstPath<TSESTree.Node>,
      options: ParserOptions,
      print: (path: AstPath) => Doc,
    ) {
      const node: TSESTree.Node = path.node;

      const formatRow = (
        path: AstPath<TSESTree.Node | null>,
        index: number,
      ): PrintedDoc[] => {
        const printed = path.map(print, "elements");

        // fs.writeFileSync(`debug_doc_${index}.json`, JSON.stringify(printed, null, 2));

        const cleaned = printed
          .map(removeLineBreaks)
          .filter((element) => element !== null);

        const columns = cleaned.map((column) =>
          printer.printDocToString(column, {
            ...options,
            printWidth: Infinity,
          }),
        );

        return columns;
      };

      const getColumnWidths = (rows: PrintedDoc[][]) => {
        const columnWidths: number[] = [];
        for (const row of rows) {
          for (const [iColumn, column] of row.entries()) {
            columnWidths[iColumn] = Math.max(
              column.formatted.length,
              columnWidths[iColumn] || 0,
            );
          }
        }
        return columnWidths;
      };

      const printRow =
        (columnWidths: number[]) =>
        (row: PrintedDoc[]): Doc => [
          "[",
          pb.join(
            ", ",
            row.map((column, iColumn) => {
              // todo deal with cursors somehow
              return column.formatted.padEnd(columnWidths[iColumn]);
            }),
          ),
          "]",
        ];

      const formatAsTable = (rows: PrintedDoc[][]) => {
        const columnWidths = getColumnWidths(rows);
        return rows.map(printRow(columnWidths));
      };

      if (
        node.type === AST_NODE_TYPES.ArrayExpression &&
        (node as any)[tableSymbol]
      ) {
        const rows = path.map(formatRow, "elements");
        const cleaned = formatAsTable(rows);

        // This part is copied partially from prettier source code
        // Not sure what the "RestElement" part there is about, but it is not available here according to the types,
        // so I removed it
        // https://github.com/prettier/prettier/blob/e5a75f59692d1e42be8334518b4cee715b9d9ea8/src/language-js/print/array.js#L72-L86
        const lastElem = node.elements.at(-1);
        const needsForcedTrailingComma = lastElem === null;
        const trailingComma =
          needsForcedTrailingComma || shouldPrintComma(options) ? "," : "";

        const result = [
          "[",
          pb.indent([
            pb.hardline,
            pb.join([",", pb.hardline], cleaned),
            trailingComma,
          ]),
          pb.hardline,
          "]",
        ];

        // fs.writeFileSync("debug_doc_result.json", JSON.stringify(result, null, 2));

        return result;
      }

      if (
        node.type === AST_NODE_TYPES.CallExpression &&
        (node as any)[tableSymbol]
      ) {
        const rows = path.map(formatRow, "arguments");
        const cleaned = formatAsTable(rows);

        const trailingComma = shouldPrintComma(options, "all") ? "," : "";
        const optional = printOptionalToken(path);
        const args = [
          "(",
          pb.indent([
            pb.hardline,
            pb.join([",", pb.hardline], cleaned),
            trailingComma,
          ]),
          pb.hardline,
          ")",
        ];

        return [
          print("callee" as any), // somehow it works :shrug:
          optional,
          printFunctionTypeParameters(path, options, print),
          args,
        ];
      }

      // Use default printer for non-table nodes
      return estree.printers.estree.print(path, options, print);
    },
  }))(),
} satisfies Record<string, Printer>;
