import { normalize } from "./index.js";

export interface Response {
  code: number;
  stdout: string;
  stderr: string;
}

function document(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("invalid JSON");
  }
}

/** Keep rendering errors deterministic, even for unusual thrown values. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function run(text: string): Response {
  try {
    return {
      code: 0,
      stdout: JSON.stringify(normalize(document(text))) + "\n",
      stderr: "",
    };
  } catch (error) {
    return { code: 2, stdout: "", stderr: `error: ${errorMessage(error)}\n` };
  }
}
