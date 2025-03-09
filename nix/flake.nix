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



# {
#   description = "A basic flake with a shell";

#   inputs.systems.url = "github:nix-systems/default";
#   inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
#   inputs.flake-utils = {
#     url = "github:numtide/flake-utils";
#     inputs.systems.follows = "systems";
#   };

#   inputs.package_json_src = {
#     url = "https://raw.githubusercontent.com/zaripych/gpt-refactor-bot/refs/heads/main/package.json";
#     flake = false;
#   };

#   outputs = { nixpkgs, flake-utils, package_json_src, ... }:
#     flake-utils.lib.eachDefaultSystem (system:
#       let
#         pkgs = nixpkgs.legacyPackages.${system};

#         # Import and call the package-json-engines module directly
#         versions = import ./package-json-engines/default.nix {
#           lib = pkgs.lib;
#           packageJsonSrc = package_json_src;
#           defaults = {
#             node = "20";
#             pnpm = "8";
#           };
#         };

#         customPkgs = import nixpkgs {
#           inherit system;

#           overlays = [
#             (self: super: {
#               nodejs = super."nodejs_${versions.node}";
#               pnpm = super."pnpm_${versions.pnpm}";
#             })
#           ];
#         };
#       in
#       {
#         devShells.default = customPkgs.mkShell {
#           packages = with customPkgs; [
#             nodejs
#             pnpm
#             glow
#           ];

#           shellHook = ''
#             zsh
#             exit $?
#           '';
#         };

#         legacyPackages = nixpkgs.legacyPackages.${system};
#       }
#     );
# }
