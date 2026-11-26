import type { Previewed } from "../preview.js";
import { build } from "./build.js";
import { readPlugin } from "./folder.js";

import { basename } from "node:path";
import { fileURLToPath } from "node:url";

import { type ViteDevServer, createServer, searchForWorkspaceRoot } from "vite";

import type { Json, Manifest, Messages } from "@a-novel/plugins-narrative-engine-contract";

/** PreviewOptions set where the preview listens. */
export interface PreviewOptions {
  /** The port to listen on. The next free one is taken when it is busy. */
  port?: number;
  /** The address to listen on: the machine alone when omitted. */
  host?: string;
}

// The kit, and the script of the page in it. The kit's own tests run its sources.
const KIT = fileURLToPath(new URL("../..", import.meta.url));
// The fonts of the page, which a plugin outside the workspace of the kit could not reach.
const FONTS = fileURLToPath(new URL(".", import.meta.resolve("@a-novel-kit/uikit-fonts/fonts.css")));
const SCRIPT = fileURLToPath(
  new URL(import.meta.url.endsWith(".ts") ? "../preview.ts" : "../preview.js", import.meta.url)
);

// The page holds the plugin and nothing else, as the workspace of its host does. Its script mounts
// the plugin, and reads every choice from the address.
const PAGE = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Plugin preview</title>
    <link rel="icon" href="data:," />
  </head>
  <body>
    <script type="module" src="/@fs/${SCRIPT}"></script>
  </body>
</html>
`;

/** Describes the current version of a plugin to the page, read from its folder as it is now. */
function describe(path: string): Previewed {
  const { name, version, versions, languages } = readPlugin(path);
  const { manifest, fixtures } = versions.at(-1)!;
  const named = Object.entries(fixtures).map(([file, content]): [string, Json] => [basename(file, ".json"), content]);

  return {
    name,
    version,
    manifest: manifest as Manifest,
    languages: languages as Record<string, Messages>,
    fixtures: Object.fromEntries(named),
  };
}

/**
 * Serves a page that mounts the plugin of a folder as a host application does, with the UI module
 * `build` writes. The page reloads when a file of the plugin changes, on a new build.
 *
 * The server opens no browser. It runs until it is closed.
 */
export async function preview(path: string, { port, host }: PreviewOptions = {}): Promise<ViteDevServer> {
  // The build the page loads, kept until a file of the plugin changes.
  let ui: Promise<string> | undefined;

  const routes: Record<string, () => Promise<[type: string, body: string]>> = {
    "/": async () => ["text/html", await server.transformIndexHtml("/", PAGE)],
    "/plugin.json": async () => ["application/json", JSON.stringify(describe(path))],
    "/ui.js": async () => ["text/javascript", await (ui ??= build(readPlugin(path)).then((built) => built.ui))],
  };

  const server = await createServer({
    root: path,
    configFile: false,
    // The routes above are the application: the server adds the modules and the files they import.
    appType: "custom",
    server: { port, host, fs: { allow: [searchForWorkspaceRoot(path), KIT, FONTS] } },
    // The page imports ES modules alone, which a browser loads as they are.
    optimizeDeps: { noDiscovery: true },
    plugins: [
      {
        name: "plugin-kit:preview",
        configureServer({ middlewares, watcher, ws }) {
          watcher.on("all", (_, file) => {
            // A build writes to `dist`, and neither folder holds a source of the plugin.
            if (/[/\\](?:dist|node_modules)[/\\]/.test(file)) return;

            ui = undefined;
            ws.send({ type: "full-reload" });
          });

          middlewares.use((request, response, next) => {
            const route = routes[new URL(request.url ?? "/", "http://localhost").pathname];
            if (route === undefined) return next();

            const answer = ([type, body]: [string, string]) =>
              response.writeHead(200, { "content-type": type, "cache-control": "no-store" }).end(body);
            route().then(answer, next);
          });
        },
      },
    ],
  });

  return server.listen();
}
