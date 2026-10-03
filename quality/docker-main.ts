import { runNpm } from "./commands.js";
import { runDockerVerifier } from "./docker.js";

const root = process.cwd();
if (process.platform === "linux") {
  runDockerVerifier(root, Number(process.versions.node.split(".")[0]));
} else {
  runNpm(["run", "verify:installed"], root, 7_200_000);
}
