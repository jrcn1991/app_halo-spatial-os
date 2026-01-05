#!/usr/bin/env bash
#
# Publica um aviso ou uma atividade na ilha dinâmica do Halo, pela API local
# (um socket Unix em $XDG_RUNTIME_DIR/halo-ilha.sock — ver src/main/island/api.ts).
#
#   tools/ilha-avisar.sh "Deploy pronto" "produção" ok
#   tools/ilha-avisar.sh --atividade build-1 "npm run build"            # começa
#   tools/ilha-avisar.sh --atividade build-1 "npm run build" ok "12s"   # termina
#   tools/ilha-avisar.sh --atividade cp "copiando" andamento "" 0.4     # progresso
#
# Exemplo de hook do Claude Code (~/.claude/settings.json), para a pílula
# avisar quando um agente num terminal termina o turno:
#
#   "hooks": { "Stop": [{ "hooks": [{ "type": "command",
#     "command": "/caminho/tools/ilha-avisar.sh 'Claude terminou' \"$PWD\"" }] }] }
#
# Sem a ilha de pé (socket ausente) o script sai em silêncio: um hook não
# pode falhar por causa de um enfeite.
set -u

sock="${XDG_RUNTIME_DIR:-/tmp}/halo-ilha.sock"
[ -S "$sock" ] || exit 0

# Escapa aspas, barras e quebras de linha para caber num JSON de uma linha.
json() {
  local s=${1//\\/\\\\}
  s=${s//\"/\\\"}
  s=${s//$'\n'/ }
  s=${s//$'\t'/ }
  printf '%s' "$s"
}

if [ "${1:-}" = "--atividade" ]; then
  id=$(json "${2:-}")
  titulo=$(json "${3:-}")
  estado="${4:-andamento}"
  detalhe=$(json "${5:-}")
  progresso="${6:-}"
  msg="{\"tipo\":\"atividade\",\"id\":\"$id\",\"titulo\":\"$titulo\",\"estado\":\"$estado\",\"detalhe\":\"$detalhe\",\"origem\":\"script\""
  [ -n "$progresso" ] && msg="$msg,\"progresso\":$progresso"
  msg="$msg}"
else
  titulo=$(json "${1:-aviso}")
  detalhe=$(json "${2:-}")
  nivel="${3:-ok}"
  msg="{\"tipo\":\"aviso\",\"titulo\":\"$titulo\",\"detalhe\":\"$detalhe\",\"nivel\":\"$nivel\"}"
fi

# O primeiro que existir: socat, nc (OpenBSD) ou python3.
if command -v socat >/dev/null 2>&1; then
  printf '%s\n' "$msg" | socat -t 1 - "UNIX-CONNECT:$sock" >/dev/null 2>&1
elif command -v nc >/dev/null 2>&1; then
  printf '%s\n' "$msg" | nc -U -q 1 "$sock" >/dev/null 2>&1
elif command -v python3 >/dev/null 2>&1; then
  python3 - "$sock" "$msg" <<'PY' >/dev/null 2>&1
import socket, sys
s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
s.settimeout(1)
s.connect(sys.argv[1])
s.sendall((sys.argv[2] + "\n").encode())
try:
    s.recv(64)
except Exception:
    pass
s.close()
PY
fi
exit 0
