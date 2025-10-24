import fs from "node:fs";
import ts from "typescript";
import { defineConfig } from "vitepress";

const toodlePattern =
  /^\{toodle=(?<path>[\w\/\.\-]+) width=(?<width>\w.+) height=(?<height>\w.+)\}$/;

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: "Toodle",
  description: "A WebGPU 2d Renderer",
  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    nav: [
      { text: "Home", link: "/" },
      { text: "Changelog", link: "/CHANGELOG.md" },
      { text: "API Reference", link: "/api/modules" },
    ],

    sidebar: [
      {
        text: "Getting Started",
        items: [
          { text: "Quickstart", link: "/quickstart" },
          { text: "Limits", link: "/limits" },
          { text: "Filter Mode", link: "/examples/filter-mode" },
        ],
      },
      {
        text: "Drawing Textures",
        items: [
          { text: "Basic Quad", link: "/examples/basic-quad" },
          { text: "Parent Hierarchy", link: "/examples/transforms" },
          { text: "Size and Scale", link: "/examples/quad-size-scale" },
          { text: "Flip X and Flip Y", link: "/examples/flipxy" },
          { text: "Layers", link: "/examples/layer" },
          { text: "Animated Sprites", link: "/examples/sprite-region" },
        ],
      },
      {
        text: "Drawing Text",
        items: [
          { text: "Hello World", link: "/examples/hello-text" },
          { text: "Alignment", link: "/examples/text-alignment" },
          { text: "Word Wrap", link: "/examples/text-word-wrap" },
          { text: "Shrink to Fit", link: "/examples/text-shrink-to-fit" },
          { text: "Fonts", link: "/examples/text-fonts" },
        ],
      },
      {
        text: "Drawing Shapes",
        items: [
          {
            text: "Lines / Rects / Circles",
            link: "/examples/shapes-line",
          },
        ],
      },
      {
        text: "Asset Management",
        items: [
          { text: "Bundles", link: "/examples/texture-bundles" },
          {
            text: "Pre-baking Atlases",
            link: "/examples/texture-bundles-prebaked",
          },
          { text: "Cropping", link: "/examples/transparent-cropping" },
          { text: "Jumbo Textures", link: "/examples/jumbo-textures" },
        ],
      },
      {
        text: "Shaders",
        items: [
          { text: "Default shader", link: "/examples/shader-default" },
          { text: "Color Flash", link: "/examples/shader-color-flash" },
          { text: "Fill", link: "/examples/shader-fill" },
        ],
      },
      {
        text: "Layout",
        items: [
          {
            text: "Nodes and Hierarchy",
            link: "/examples/add-and-remove-children",
          },

          { text: "Edges", link: "/examples/layout-edges" },

          {
            text: "Screen and World Space",
            link: "/examples/layout-screen-and-world-space",
          },
        ],
      },
      {
        text: "Vintage SDK Integration",
        items: [
          {
            text: "Using Toodle in the Vintage SDK",
            link: "/examples/vintage-sdk-integration",
          },
        ],
      },
    ],

    editLink: {
      pattern: "https://github.com/bloopgames/toodle/edit/main/docs/:path",
    },

    socialLinks: [
      { icon: "github", link: "https://github.com/bloopgames/toodle" },
    ],
  },
  vue: {
    template: {
      compilerOptions: {
        whitespace: "preserve",
      },
    },
  },
  vite: {
    plugins: [
      {
        name: "toodle-full-reload",
        handleHotUpdate(ctx) {
          ctx.server.ws.send({
            type: "full-reload",
            path: "*",
          });
        },
      },
    ],
  },
  // https://vitepress.dev/reference/site-config#markdown
  markdown: {
    config: (md) => {
      // This custom plugin allows referencing a TS file inside markdown, and have it
      // render the example visibly.
      // Use it like `{toodle=quickstart.ts width=100% height=400px}` in markdown
      md.use((mdit) => {
        mdit.renderer.rules.toodle = (tokens, id, options, env, self) => {
          const token = tokens[id];
          const { filePath, canvasWidth, canvasHeight } = token.meta;
          let tsCode = fs.readFileSync(filePath, "utf-8");
          const canvasId = `canvas-example-${id}`;

          tsCode += `
            if (toodle) {
              window.GLOBAL_REGISTERED_TOODLES.push(toodle);
            }
          `;

          const js = ts.transpileModule(tsCode, {
            transformers: { before: [sourceTransformer(canvasId)] },
            reportDiagnostics: true,
            compilerOptions: {
              removeComments: true,
              module: ts.ModuleKind.ES2022,
              target: ts.ScriptTarget.ES2022,
            },
          });

          if (js.diagnostics?.length) {
            console.warn(js.diagnostics);
          }

          return `
          <ClientOnly>
            <canvas id="${canvasId}" style="width: 100%; aspect-ratio: 16/9;"></canvas>
            <component is="script" type="module">
              ${js.outputText}
            </component>
          </ClientOnly>
          `;
        };

        mdit.block.ruler.before(
          "fence",
          "toodle",
          (state, startLine, endLine, silent) => {
            const pos = state.bMarks[startLine] + state.tShift[startLine];
            const max = state.eMarks[startLine];

            const line = state.src.slice(pos, max).trim();
            const match = line.match(toodlePattern);

            if (!match?.groups) return false;
            if (silent) return true;

            state.line = startLine + 1;
            const token = state.push("toodle", "", 0);
            token.meta = {
              filePath: match.groups.path,
              canvasWidth: match.groups.width,
              canvasHeight: match.groups.height,
            };

            return true;
          },
        );
      });
    },
  },
});

/**
 * This function takes a typescript source file and transforms the import statements and canvas declaration.
 * It transforms the code so it's runnable in a browser without imports so it replaces
 * imports to the toodle package with just a toodle window access.
 * It also changes the canvas declaration to use one with an ID for the canvas because there
 * can be many canvases on one screen.
 *
 * Example, transforms the following:
 *
 * import { Toodle, Quad } from '@bloop.gg/toodle'
 * const canvas = document.querySelector("canvas")!;
 *
 * into the following:
 *
 * const { Toodle, Quad } = window.TOODLE
 * const canvas = document.getElementById("specific-id-injected") as HTMLCanvasElement;
 */
const sourceTransformer =
  (canvasId: string): ts.TransformerFactory<ts.SourceFile> =>
  (ctx) =>
  (src) =>
    ts.visitEachChild(src, nodeTransformer(canvasId), ctx);

const nodeTransformer =
  (canvasId: string): ts.Transformer<ts.Node> =>
  (node) => {
    if (ts.isImportDeclaration(node)) {
      return importTransformer(node);
    }

    if (ts.isVariableStatement(node)) {
      const isCanvas = node.declarationList.declarations.find(
        (declaration) =>
          ts.isIdentifier(declaration.name) &&
          declaration.name.text === "canvas",
      );
      if (isCanvas) {
        return canvasStatement(canvasId);
      }
    }

    return node;
  };

function canvasStatement(canvasId: string): ts.VariableStatement {
  return ts.factory.createVariableStatement(
    undefined,
    ts.factory.createVariableDeclarationList(
      [
        ts.factory.createVariableDeclaration(
          ts.factory.createIdentifier("canvas"),
          undefined,
          undefined,
          ts.factory.createAsExpression(
            ts.factory.createCallExpression(
              ts.factory.createPropertyAccessExpression(
                ts.factory.createIdentifier("document"),
                ts.factory.createIdentifier("getElementById"),
              ),
              undefined,
              [ts.factory.createStringLiteral(canvasId)],
            ),
            ts.factory.createTypeReferenceNode(
              ts.factory.createIdentifier("HTMLCanvasElement"),
              undefined,
            ),
          ),
        ),
      ],
      ts.NodeFlags.Const,
    ),
  );
}

function importTransformer(declaration: ts.ImportDeclaration) {
  const bindings = declaration.importClause?.namedBindings;

  let names: string[] = [];
  if (bindings && ts.isNamedImports(bindings)) {
    names = bindings.elements.map((el) =>
      ts.isIdentifier(el.name) ? el.name.text : "UNKNOWN_IMPORT",
    );
  }

  return ts.factory.createVariableStatement(
    undefined,
    ts.factory.createVariableDeclarationList(
      [
        ts.factory.createVariableDeclaration(
          ts.factory.createObjectBindingPattern(
            names.map((n) =>
              ts.factory.createBindingElement(undefined, undefined, n),
            ),
          ),
          undefined,
          undefined,
          ts.factory.createPropertyAccessExpression(
            ts.factory.createIdentifier("window"),
            ts.factory.createIdentifier("TOODLE"),
          ),
        ),
      ],
      ts.NodeFlags.Const,
    ),
  );
}
