import { setImmediate } from "node:timers/promises";
import { afterAll } from "vitest";
import { installWarningGuard } from "../quality/warning-guard.js";

installWarningGuard(process, afterAll, setImmediate);
