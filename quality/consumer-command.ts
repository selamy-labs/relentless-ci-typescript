import { spawnSync } from "node:child_process";
import { z } from "zod";

const outcome = z.object({
  status: z.number().int(),
  stdout: z.string(),
  stderr: z.string(),
});
type Outcome = z.infer<typeof outcome>;
const complete = outcome.extend({
  error: z.never().optional(),
  signal: z.null(),
});
const networkPrelude = [
  "import net from 'node:net'",
  "import tls from 'node:tls'",
  "import http from 'node:http'",
  "import https from 'node:https'",
  "import dgram from 'node:dgram'",
  "import {syncBuiltinESMExports} from 'node:module'",
  "const deny=()=>{throw new Error('installed consumer network access denied')}",
  "globalThis.fetch=deny",
  "net.Socket.prototype.connect=deny",
  "tls.connect=deny",
  "http.request=deny",
  "http.get=deny",
  "https.request=deny",
  "https.get=deny",
  "dgram.Socket.prototype.send=deny",
  "syncBuiltinESMExports()",
].join(";");
const inherited = [
  "PATH",
  "PATHEXT",
  "SystemRoot",
  "WINDIR",
  "ComSpec",
  "LD_LIBRARY_PATH",
] as const;

export function consumerEnvironment(root: string): NodeJS.ProcessEnv {
  const platform = Object.fromEntries(
    inherited.flatMap((name) =>
      process.env[name] === undefined ? [] : [[name, process.env[name]]],
    ),
  );
  return {
    ...platform,
    HOME: root,
    USERPROFILE: root,
    APPDATA: root,
    LOCALAPPDATA: root,
    TMPDIR: root,
    TEMP: root,
    TMP: root,
    NODE_OPTIONS: `--import=data:text/javascript;base64,${Buffer.from(networkPrelude).toString("base64")}`,
  };
}

export function consumerNode(
  args: string[],
  root: string,
  timeout: number,
  input: string,
  expected: Outcome,
): void {
  const actual = complete.parse(
    spawnSync(process.execPath, args, {
      cwd: root,
      timeout,
      input,
      encoding: "utf8",
      env: consumerEnvironment(root),
    }),
  );
  for (const field of ["status", "stdout", "stderr"] as const) {
    if (actual[field] !== expected[field])
      throw new Error(`installed consumer ${field} differs from its contract`);
  }
}
