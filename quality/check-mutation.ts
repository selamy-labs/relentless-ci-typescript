import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { mutationPlan } from "./mutation-plan.js";
import { verifyMutationReport } from "./mutation-report.js";

function readEvent(directory: string, event: string): unknown {
  const candidates = readdirSync(directory).filter((name) =>
    name.endsWith(`-${event}.json`),
  );
  const [name] = z.tuple([z.string()]).parse(candidates);
  return JSON.parse(readFileSync(join(directory, name)).toString("utf8"));
}

export function checkMutation(root: string): number {
  const directory = join(root, ".quality-results", "mutation-events");
  const plan = mutationPlan(
    readEvent(directory, "onMutationTestingPlanReady"),
    root,
  );
  const report = readEvent(directory, "onMutationTestReportReady");
  return verifyMutationReport(plan, report);
}
