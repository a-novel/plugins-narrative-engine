import path from "node:path";

import { Eslint } from "@a-novel-kit/nodelib-config";

export default Eslint({ gitIgnorePath: path.join(import.meta.dirname, ".gitignore") });
