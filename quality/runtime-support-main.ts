import { verifyRuntimes } from "./runtime-support.js";

verifyRuntimes(process.cwd(), new Date().toISOString().slice(0, 10));
