const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");
const config = getDefaultConfig(projectRoot);
const appUiNativePath = path.resolve(projectRoot, "lib/ui-native.tsx");

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "@hairfit/ui-native") {
    return {
      type: "sourceFile",
      filePath: appUiNativePath,
    };
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
