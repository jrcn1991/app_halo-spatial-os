# shellcheck shell=bash
#
# Os comandos longos do seu shell aparecem na ilha dinâmica do Halo — o
# "Shell Activity" dos apps de notch. Carregue no seu .zshrc ou .bashrc:
#
#   source "/caminho/para/halo-spatial-os/tools/ilha-shell.sh"
#
# O app NUNCA escreve nos seus arquivos de shell; carregar é decisão sua.
#
# Como funciona: antes de cada comando o shell publica uma atividade no
# socket da ilha ($XDG_RUNTIME_DIR/halo-ilha.sock); quando o prompt volta,
# publica o desfecho (ok, ou erro com o código). A ilha só MOSTRA o que já
# dura 8 segundos, e só ANUNCIA o fim do que durou isso ou falhou — um `ls`
# não passa pela pílula. Sem a ilha de pé, nada acontece (e nada custa).

__halo_ilha_sock="${XDG_RUNTIME_DIR:-/tmp}/halo-ilha.sock"
__halo_ilha_id=""

__halo_ilha_envia() {
  [ -S "$__halo_ilha_sock" ] || return 0
  if command -v socat >/dev/null 2>&1; then
    printf '%s\n' "$1" | socat -t 1 - "UNIX-CONNECT:$__halo_ilha_sock" >/dev/null 2>&1 &
  elif command -v nc >/dev/null 2>&1; then
    printf '%s\n' "$1" | nc -U -q 1 "$__halo_ilha_sock" >/dev/null 2>&1 &
  fi
}

__halo_ilha_json() {
  local s=${1//\\/\\\\}
  s=${s//\"/\\\"}
  s=${s//$'\n'/ }
  printf '%s' "${s:0:100}"
}

# O comando começou.
__halo_ilha_antes() {
  local cmd="$1"
  case "$cmd" in
    ''|__halo_*|cd\ *|ls*|clear|exit|pwd) __halo_ilha_id=""; return 0 ;;
  esac
  __halo_ilha_id="sh-$$-$RANDOM"
  __halo_ilha_envia "{\"tipo\":\"atividade\",\"id\":\"$__halo_ilha_id\",\"titulo\":\"$(__halo_ilha_json "$cmd")\",\"origem\":\"shell\"}"
}

# O prompt voltou: o comando terminou com $?.
__halo_ilha_depois() {
  local rc=$?
  [ -n "$__halo_ilha_id" ] || return 0
  local estado="ok" detalhe="terminou"
  if [ "$rc" -ne 0 ]; then estado="erro"; detalhe="código $rc"; fi
  __halo_ilha_envia "{\"tipo\":\"atividade\",\"id\":\"$__halo_ilha_id\",\"estado\":\"$estado\",\"detalhe\":\"$detalhe\"}"
  __halo_ilha_id=""
  return 0
}

if [ -n "${ZSH_VERSION:-}" ]; then
  autoload -Uz add-zsh-hook
  add-zsh-hook preexec __halo_ilha_antes
  add-zsh-hook precmd __halo_ilha_depois
elif [ -n "${BASH_VERSION:-}" ]; then
  # No bash o DEBUG dispara a cada comando simples; o primeiro depois do
  # prompt é o que interessa, e `__halo_ilha_armado` garante um por linha.
  __halo_ilha_armado=1
  __halo_ilha_debug() {
    [ -n "$__halo_ilha_armado" ] || return 0
    [ -n "$COMP_LINE" ] && return 0
    __halo_ilha_armado=""
    __halo_ilha_antes "$BASH_COMMAND"
  }
  __halo_ilha_prompt() {
    __halo_ilha_depois
    __halo_ilha_armado=1
  }
  trap '__halo_ilha_debug' DEBUG
  PROMPT_COMMAND="__halo_ilha_prompt${PROMPT_COMMAND:+;$PROMPT_COMMAND}"
fi
