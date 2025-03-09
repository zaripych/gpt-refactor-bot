{ lib
, glow ? null
, docsFormatter ? "${glow}/bin/glow"
, welcomeMarkdown ? ''
    # Welcome
  ''
}:
let

  ALREADY_INSIDE_HINT = ''
    # **WARNING**

    You are already inside the dev environment `exit` the current shell and try again.
  '';

  importMultiline = varAttr:
    let
      name = builtins.elemAt (builtins.attrNames varAttr) 0;
      value = varAttr.${name};
    in
    ''
      ${name}=$(cat <<- 'EOF'
      ${value}
      EOF
      )
    '';

  checkInsideDevEnvironment = ''
    checkInsideDevEnvironment () {
      if [ "$INSIDE_DEV_ENVIRONMENT" == "yes" ]; then
        echo "$ALREADY_INSIDE_HINT" | ${docsFormatter}
        exit 1;
      fi
    }
  '';

in
{
  shellHook = ''
    ${(importMultiline { inherit ALREADY_INSIDE_HINT; })}
    ${(importMultiline { inherit welcomeMarkdown; })}
    ${checkInsideDevEnvironment}

    checkInsideDevEnvironment

    export INSIDE_DEV_ENVIRONMENT='yes'

    echo "$welcomeMarkdown" | ${docsFormatter}
  '';
}





