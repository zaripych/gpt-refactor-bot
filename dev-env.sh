# If checkInsideDevEnvironment is declared, call it
if [ -n "$checkInsideDevEnvironment" ]; then
  checkInsideDevEnvironment
fi

nix flake update --flake ./nix --override-input package-json-src path:./package.json package-json-src
nix develop ./nix --override-input package-json-src path:./package.json --command $SHELL
