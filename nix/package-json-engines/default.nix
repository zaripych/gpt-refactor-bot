{ lib, packageJsonSrc, defaults ? { } }:
let
  packageJson = lib.trivial.importJSON packageJsonSrc;

  # Extract the major version number from a version string by:
  # 1. Removing version requirement indicators (<>=^)
  # 2. Parsing the resulting version string
  cleanupVersion = version: (builtins.replaceStrings [ "<" ">" "=" "^" ] [ "" "" "" "" ] version);

  # Parse a string like "pnpm@1.2.3" into separate name and version components
  parsePackageVersion = packageNameAndVersion:
    let
      # Split the string at the "@" character
      components = builtins.split "@" packageNameAndVersion;
      # Extract the version part (after @) if it exists
      # Otherwise, return null for the version
      versionPart =
        if builtins.length components == 3
        then builtins.elemAt components 2
        else null;
      # Extract the package name (before @) if it exists
      packagePart =
        if builtins.length components == 3 || builtins.length components == 1
        then builtins.elemAt components 0
        else null;
    in
    {
      name = packagePart;
      version = cleanupVersion versionPart;
    };

  # Get a unified list of all keys from engines and defaults (excluding packageManager)
  engines = packageJson.engines or { };
  defaultsWithoutPackageManager = removeAttrs defaults [ "packageManager" ];
  allEngineKeys = lib.unique (
    (builtins.attrNames engines) ++
    (builtins.attrNames defaultsWithoutPackageManager)
  );

  # Process all engine entries from both packageJson.engines and defaults
  processedEngines =
    let
      # Create an attribute for a single engine with fallback to defaults
      processEngine = name: {
        ${name} = cleanupVersion (engines.${name} or (defaults.${name} or null));
      };
    in
    lib.foldl' (acc: name: acc // (processEngine name)) { } allEngineKeys;

  # Create the packageManager attribute if it's defined in packageJson
  # or in the defaults, otherwise return an empty set
  packageManagerAttr =
    if packageJson ? packageManager
    then { packageManager = parsePackageVersion packageJson.packageManager; }
    else if defaults ? packageManager
    then { packageManager = defaults.packageManager; }
    else { };
in
processedEngines // packageManagerAttr
