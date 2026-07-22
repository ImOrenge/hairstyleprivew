import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const registryPath = path.resolve(
  repositoryRoot,
  process.argv[2] || "docs/components/component-registry.json",
);
const allowedKinds = new Set([
  "primitive",
  "layout",
  "composite",
  "data-display",
  "form",
  "feedback",
  "feature",
  "page",
]);
const allowedStatuses = new Set(["experimental", "candidate", "stable", "deprecated"]);
const errors = [];

function addError(message) {
  errors.push(message);
}

function readPassportScalar(source, key) {
  const match = source.match(new RegExp(`^${key}:\\s*(.+?)\\s*$`, "m"));
  if (!match) return null;
  const value = match[1].trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

if (!existsSync(registryPath)) {
  throw new Error(`Component registry not found: ${registryPath}`);
}

let registry;
try {
  registry = JSON.parse(readFileSync(registryPath, "utf8").replace(/^\uFEFF/, ""));
} catch (error) {
  throw new Error(`Component registry must be valid JSON: ${error instanceof Error ? error.message : String(error)}`);
}

const components = Array.isArray(registry) ? registry : registry.components;
if (!Array.isArray(components)) {
  throw new Error("Component registry must be an array or expose a components array.");
}

const ids = new Set();
const passports = new Set();
let stableCount = 0;

for (const [index, component] of components.entries()) {
  const label = component?.id || `components[${index}]`;
  if (!component || typeof component !== "object") {
    addError(`${label}: component entry must be an object`);
    continue;
  }
  if (!component.id) {
    addError(`${label}: id is required`);
  } else if (ids.has(component.id)) {
    addError(`${label}: duplicate id`);
  } else {
    ids.add(component.id);
  }
  if (!allowedKinds.has(component.kind)) {
    addError(`${label}: unsupported kind '${component.kind}'`);
  }
  if (!allowedStatuses.has(component.status)) {
    addError(`${label}: unsupported status '${component.status}'`);
  }
  if (component.status === "stable") stableCount += 1;

  const sourcePath = component.source && path.resolve(repositoryRoot, component.source);
  if (!sourcePath || !existsSync(sourcePath)) {
    addError(`${label}: source does not exist (${component.source || "missing"})`);
  }

  const passportPath = component.passport && path.resolve(repositoryRoot, component.passport);
  if (!passportPath || !existsSync(passportPath)) {
    addError(`${label}: passport does not exist (${component.passport || "missing"})`);
  } else if (passports.has(component.passport)) {
    addError(`${label}: passport is shared by more than one registry entry (${component.passport})`);
  } else {
    passports.add(component.passport);
    const passportSource = readFileSync(passportPath, "utf8").replace(/^\uFEFF/, "");
    for (const field of ["id", "name", "platform", "kind", "status", "source", "owner"]) {
      const passportValue = readPassportScalar(passportSource, field);
      if (passportValue === null) {
        addError(`${label}: passport is missing top-level ${field}`);
      } else if (passportValue !== component[field]) {
        addError(
          `${label}: registry ${field} '${component[field]}' does not match passport '${passportValue}'`,
        );
      }
    }
  }

  const cssFile = component.styling?.global_css?.file;
  if (cssFile && !existsSync(path.resolve(repositoryRoot, cssFile))) {
    addError(`${label}: global CSS file does not exist (${cssFile})`);
  }
}

const declaredStableCount = registry?.policy?.stable_component_count;
if (typeof declaredStableCount === "number" && declaredStableCount !== stableCount) {
  addError(`policy.stable_component_count is ${declaredStableCount}, actual is ${stableCount}`);
}

if (errors.length > 0) {
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(
    `Component registry valid: ${components.length} components, ${passports.size} passports, ${stableCount} stable.`,
  );
}
