import { AstPath, Doc, Parser, ParserOptions, Printer, Plugin } from "prettier";
import { createWrappedMultiTargetProxy } from "proxy-vir";
import { printers as estreePrinters } from "prettier/plugins/estree";
import { parsers as tsParsers } from "prettier/plugins/typescript";
import { parsers as babelParsers } from "prettier/plugins/babel";
import type { TSESTree } from "@typescript-eslint/types";
import { builders as pb, printer } from "prettier/doc";
import {
  PrintedDoc,
  printFunctionTypeParameters,
  printOptionalToken,
  shouldPrintComma,
} from "./prettier-utils.js";
import fs from "node:fs";

const hasPrevLineTableComment = (
  node: TSESTree.Node,
  comments: TSESTree.Comment[] | undefined,
) => {
  const nodeLine = node.loc.start.line;
  const prevComment = comments?.find(
    (comment) =>
      comment.type === "Line" &&
      comment.loc.start.line === comment.loc.end.line &&
      comment.loc.end.line === nodeLine - 1,
  );

  if (!prevComment) return false;
  return prevComment.value.split(/\s+/).includes("prettier-table");
};

const checkIsTable = (
  node: TSESTree.Node,
  elements: (TSESTree.Node | null)[],
  comments: TSESTree.Comment[] | undefined,
) => {
  const isTable =
    elements.length > 1 &&
    elements.every((element) => element && element.type === "ArrayExpression");
  if (!isTable) return false;
  return hasPrevLineTableComment(node, comments);
};

const removeLineBreaks = (element: Doc): Doc | null => {
  if (typeof element === "string") return element;
  if (Array.isArray(element)) {
    return element.map(removeLineBreaks).filter((element) => element !== null);
  }

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

export const pluginMarker = Symbol("pluginMarker");
let originalPrinter: Printer | undefined;
function setOriginalPrinter(input: Printer) {
  originalPrinter = input;
}
function getOriginalPrinter(): Printer {
  if (!originalPrinter) {
    throw new Error(`originalPrinter hasn't been defined yet!`);
  }
  return originalPrinter;
}

function findPluginsByParserName(
  parserName: string,
  plugins: (Plugin | string)[],
): Plugin[] {
  return plugins.filter((plugin): plugin is Plugin => {
    return (
      typeof plugin === "object" &&
      (plugin as any as { pluginMarker: any }).pluginMarker !== pluginMarker &&
      !!plugin.parsers?.[parserName]
    );
  });
}

function registerPluginPrinter(options: ParserOptions) {
  if ("printer" in options && options.printer !== pluginPrinter) {
    setOriginalPrinter(options.printer as any);
    // overwrite the printer with ours
    options.printer = pluginPrinter;
  } else {
    const astFormat = options.astFormat as string | undefined;
    if (!astFormat) {
      throw new Error(`Could not find astFormat while adding printer.`);
    }
    /**
     * If the printer hasn't already been assigned in options, rearrange plugins so that ours
     * gets chosen.
     */
    const plugins = options.plugins ?? [];
    const firstMatchedPlugin = plugins.find(
      (plugin): plugin is Plugin =>
        typeof plugin !== "string" &&
        !!plugin.printers &&
        !!plugin.printers[astFormat],
    );
    if (!firstMatchedPlugin || typeof firstMatchedPlugin === "string") {
      throw new Error(`Matched invalid first plugin: ${firstMatchedPlugin}`);
    }
    const matchedPrinter = firstMatchedPlugin.printers?.[astFormat];
    if (!matchedPrinter) {
      throw new Error(
        `Printer not found on matched plugin: ${JSON.stringify(firstMatchedPlugin)}`,
      );
    }
    setOriginalPrinter(matchedPrinter);
    const thisPluginIndex = plugins.findIndex((plugin) => {
      return (plugin as { pluginMarker: any }).pluginMarker === pluginMarker;
    });
    const thisPlugin = plugins[thisPluginIndex];
    if (!thisPlugin) {
      throw new Error(`This plugin was not found.`);
    }
    // remove this plugin from its current location in the array
    plugins.splice(thisPluginIndex, 1);
    // add this plugin to the beginning of the array so its printer is found first
    plugins.splice(0, 0, thisPlugin);
  }
}

function wrapParser<K extends string>(
  parsers: { [k in K]: Parser },
  parserName: K,
) {
  const originalParser = parsers[parserName];

  /** Create a multi-target proxy of parsers so that we don't block other plugins. */
  const parserProxy = createWrappedMultiTargetProxy<Parser>({
    initialTarget: originalParser,
  });

  function preprocess(text: string, options: ParserOptions) {
    const pluginsFromOptions = options.plugins ?? [];
    const pluginsWithRelevantParsers = findPluginsByParserName(
      parserName,
      pluginsFromOptions,
    );
    pluginsWithRelevantParsers.forEach((plugin) => {
      const currentParser = plugin.parsers?.[parserName];
      if (
        currentParser &&
        (plugin as { name?: string | undefined } | undefined)?.name?.includes(
          "prettier-plugin-sort-json",
        )
      ) {
        parserProxy.proxyModifier.addOverrideTarget(currentParser);
      }
    });

    const pluginsWithPreprocessor = pluginsWithRelevantParsers.filter(
      (plugin) => !!plugin.parsers?.[parserName]?.preprocess,
    );

    let processedText = text;

    pluginsWithPreprocessor.forEach((pluginWithPreprocessor) => {
      const nextText = pluginWithPreprocessor.parsers?.[
        parserName
      ]?.preprocess?.(processedText, {
        ...options,
        plugins: pluginsFromOptions.filter(
          (plugin) =>
            (plugin as any as { pluginMarker: any }).pluginMarker !==
            pluginMarker,
        ),
      });
      if (nextText != undefined) {
        processedText = nextText;
      }
    });

    registerPluginPrinter(options);

    return processedText;
  }

  parserProxy.proxyModifier.addOverrideTarget({
    preprocess,
  });

  return parserProxy.proxy;
}

function wrapInOriginalPrinterCall<T extends string = string>(
  property: keyof Printer,
  subProperty?: T,
) {
  return (...args: any[]) => {
    const originalPrinter = getOriginalPrinter();

    if (property === "print") {
      const path = args[0] as AstPath;
      const options = args[1] as ParserOptions;
      const originalOutput = originalPrinter.print.call(
        originalPrinter,
        path,
        options,
        ...(args.slice(2) as [any]),
      );

      if (
        (options.filepath as string | undefined)?.endsWith("package.json") &&
        options.plugins.some(
          (plugin) =>
            typeof plugin === "object" &&
            (plugin as { name?: string }).name?.includes(
              "prettier-plugin-packagejson",
            ),
        )
      ) {
        return originalOutput;
      }

      return originalOutput;
    } else {
      let thisParent: any = originalPrinter;
      let printerProp = originalPrinter[property];
      if (subProperty) {
        thisParent = printerProp;
        printerProp = (printerProp as any)[subProperty];
      }
      try {
        return (printerProp as Function | undefined)?.apply(thisParent, args);
      } catch (error) {
        const newError = new Error(
          `Failed to wrap JS printer call for property "${property}" ${
            subProperty ? `and subProperty "${subProperty}"` : ""
          }: \n`,
        );
        if (error instanceof Error && error.stack) {
          newError.stack = newError.message + error.stack;
        }
        throw newError;
      }
    }
  };
}

const handleComments: Printer["handleComments"] = {
  endOfLine: wrapInOriginalPrinterCall<
    keyof NonNullable<Printer["handleComments"]>
  >("handleComments", "endOfLine"),
  ownLine: wrapInOriginalPrinterCall<
    keyof NonNullable<Printer["handleComments"]>
  >("handleComments", "ownLine"),
  remaining: wrapInOriginalPrinterCall<
    keyof NonNullable<Printer["handleComments"]>
  >("handleComments", "remaining"),
};

const pluginPrinter = new Proxy<Printer<Node>>({} as Printer<Node>, {
  get: (target, property: keyof Printer) => {
    if ((property as any) === 'then') {
      return undefined;
    }

    // @ts-expect-error: the avoidAstMutation property is not defined in the types
    if (property === "experimentalFeatures") {
      return {
        avoidAstMutation: true,
      };
    }

    /**
     * "handleComments" is the only printer property which isn't a callback function, so for
     * simplicity, ignore it.
     */
    if (property === "handleComments") {
      return handleComments;
    }

    const originalPrinter = getOriginalPrinter();
    if (originalPrinter[property] === undefined) {
      return undefined;
    }

    /**
     * We have to return a callback so that we can extract the jsPlugin from the options
     * argument
     */
    return wrapInOriginalPrinterCall(property);
  },
});

function pluginPrint(
  path: AstPath<TSESTree.Node>,
  options: ParserOptions,
  print: (path: AstPath) => Doc,
  oritinalOutput: Doc,
) {
  const node: TSESTree.Node = path.node;

  const comments = options[Symbol.for("comments") as any] as
    | TSESTree.Comment[]
    | undefined;

  const formatRow = (
    path: AstPath<TSESTree.Node | null>,
    index: number,
  ): PrintedDoc[] => {
    const printed = path.map(print, "elements");

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

  if (
    node.type === "ArrayExpression" &&
    checkIsTable(node, node.elements, comments)
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

  // Use default printer for non-table nodes
  return oritinalOutput;
}

export const parsers = {
  typescript: wrapParser(tsParsers, "typescript"),
  babel: wrapParser(babelParsers, "babel"),
  "babel-ts": wrapParser(babelParsers, "babel-ts"),
};

export const printers = {
  estree: pluginPrinter,
};
