const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");
const config = getDefaultConfig(projectRoot);
const appUiNativePath = path.resolve(projectRoot, "lib/ui-native.tsx");
const primitiveUiNativePath = path.resolve(workspaceRoot, "packages/ui-native/src/index.tsx");

function appPackageRoot(packageName) {
  return path.dirname(require.resolve(`${packageName}/package.json`, { paths: [projectRoot] }));
}

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  react: appPackageRoot("react"),
  "react-dom": appPackageRoot("react-dom"),
  "react-native": appPackageRoot("react-native"),
  "react-native-safe-area-context": appPackageRoot("react-native-safe-area-context"),
};
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "@hairfit/ui-native/primitives") {
    return {
      type: "sourceFile",
      filePath: primitiveUiNativePath,
    };
  }

  if (moduleName === "@hairfit/ui-native") {
    return {
      type: "sourceFile",
      filePath: appUiNativePath,
    };
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
