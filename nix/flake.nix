{
  description = "nodejs+pnpm dev env flake";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs?ref=nixos-unstable";

    # Common flake utils
    flake-utils-plus.url = "github:gytis-ivaskevicius/flake-utils-plus";

    package-json-src = {
      url = "https://raw.githubusercontent.com/zaripych/gpt-refactor-bot/refs/heads/main/package.json";
      flake = false;
    };
  };

  outputs = inputs@{ self, flake-utils-plus, ... }:
    flake-utils-plus.lib.mkFlake
      {
        inherit self inputs;

        sharedOverlays =
          [
            (final: prev:
              let
                versions = import ./package-json-engines/default.nix {
                  lib = prev.pkgs.lib;
                  packageJsonSrc = inputs.package-json-src;
                  defaults = {
                    node = "22";
                    pnpm = "8";
                  };
                };
              in
              {
                nodejs = final."nodejs_${prev.pkgs.lib.versions.major versions.node}";
                pnpm = final."pnpm_${prev.pkgs.lib.versions.major versions.pnpm}";
              })
          ];

        outputsBuilder = channels:
          let
            versions = import ./package-json-engines/default.nix {
              lib = channels.nixpkgs.lib;
              packageJsonSrc = inputs.package-json-src;
              defaults = {
                node = "20";
                pnpm = "8";
              };
            };
            devShell = import ./dev-shell/default.nix {
              inherit (channels.nixpkgs) glow lib;

              welcomeMarkdown = ''
                # Welcome

                In this shell you can install dependencies using `pnpm install`.
              '';
            };
          in
          {
            devShell = channels.nixpkgs.mkShell {
              packages = with channels.nixpkgs; [
                nodejs
                pnpm
                glow
              ];

              shellHook = devShell.shellHook;
            };

            versions = versions;
          };
      };
}
