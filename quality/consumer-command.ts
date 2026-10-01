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
const filePrelude = `
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const owned=fs.realpathSync(process.env.RLCI_CONSUMER_ROOT);
const inside=(value)=>{
  if(typeof value==='number') throw new Error('installed consumer write outside temporary root denied');
  const absolute=path.resolve(value instanceof URL ? fileURLToPath(value) : String(value));
  let ancestor=absolute;
  const tail=[];
  for(;;){
    try { fs.lstatSync(ancestor); break; }
    catch(error){
      if(error?.code!=='ENOENT') throw error;
      tail.unshift(path.basename(ancestor));
      const parent=path.dirname(ancestor);
      if(parent===ancestor) throw error;
      ancestor=parent;
    }
  }
  const resolved=path.resolve(fs.realpathSync(ancestor),...tail);
  if(resolved!==owned && !resolved.startsWith(owned+path.sep))
    throw new Error('installed consumer write outside temporary root denied');
};
const protect=(scope,name,slots)=>{
  const original=scope[name];
  if(typeof original!=='function') throw new Error('installed consumer filesystem guard is incomplete');
  scope[name]=function(...args){
    for(const slot of slots) inside(args[slot]);
    return Reflect.apply(original,this,args);
  };
};
const single=['writeFile','writeFileSync','appendFile','appendFileSync','mkdir','mkdirSync','mkdtemp','mkdtempSync','rm','rmSync','rmdir','rmdirSync','unlink','unlinkSync','truncate','truncateSync','createWriteStream','chmod','chmodSync','chown','chownSync','utimes','utimesSync'];
const destination=['copyFile','copyFileSync','cp','cpSync','symlink','symlinkSync'];
const both=['rename','renameSync','link','linkSync'];
for(const name of single) if(typeof fs[name]==='function') protect(fs,name,[0]);
for(const name of destination) if(typeof fs[name]==='function') protect(fs,name,[1]);
for(const name of both) if(typeof fs[name]==='function') protect(fs,name,[0,1]);
for(const name of single) if(typeof fs.promises[name]==='function') protect(fs.promises,name,[0]);
for(const name of destination) if(typeof fs.promises[name]==='function') protect(fs.promises,name,[1]);
for(const name of both) if(typeof fs.promises[name]==='function') protect(fs.promises,name,[0,1]);
const writing=(flags)=>typeof flags==='number'
  ? Boolean(flags & (fs.constants.O_WRONLY|fs.constants.O_RDWR|fs.constants.O_CREAT|fs.constants.O_TRUNC|fs.constants.O_APPEND))
  : typeof flags==='string' && /[wa+]/u.test(flags);
for(const scope of [fs,fs.promises]) for(const name of ['open','openSync']){
  if(typeof scope[name]!=='function') continue;
  const original=scope[name];
  scope[name]=function(...args){
    if(writing(args[1])) inside(args[0]);
    return Reflect.apply(original,this,args);
  };
}
`;
const consumerPrelude = [
  filePrelude,
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
    RLCI_CONSUMER_ROOT: root,
    NODE_OPTIONS: `--import=data:text/javascript;base64,${Buffer.from(consumerPrelude).toString("base64")}`,
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
