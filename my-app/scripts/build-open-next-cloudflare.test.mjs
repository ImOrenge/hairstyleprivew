import assert from "node:assert/strict";
import test from "node:test";
import {
  assertDeploymentId,
  deploymentBuildEnv,
  deploymentMarker,
} from "./build-open-next-cloudflare.mjs";

const revision = "b7412d03000ee28ec2f9cab074aea07e03661887";

test("Cloudflare builds use the exact Git revision as the Next deployment ID", () => {
  assert.equal(assertDeploymentId(revision), revision);
  assert.deepEqual(deploymentMarker(revision), {
    sourceRevision: revision,
    deploymentId: revision,
  });
  assert.equal(deploymentBuildEnv({ EXISTING: "yes" }, revision).NEXT_DEPLOYMENT_ID, revision);
  assert.throws(() => assertDeploymentId("main"), /40-character Git SHA/u);
});
