# android-monitor

Dashboard web leve de automonitoramento para um celular Android rodando Termux.
Node.js + Express + SQLite nativo (`node:sqlite`), sem frameworks pesados e sem
compilação de módulos nativos.

```
┌────────────────── Android (Termux) ──────────────────┐
│  Node.js (processo único)                            │
│  ├── Collector (setInterval, padrão 5s)              │
│  │     cpu · memory · storage · battery · network    │
│  │     system  →  estado atual em memória            │
│  ├── Express                                         │
│  │     ├── /api/*  (JSON)                            │
│  │     └── /       (dashboard estático)              │
│  └── node:sqlite → snapshot a cada 60s (WAL)         │
└──────────────────────────────────────────────────────┘
        ▲ HTTP (rede local)  http://IP_DO_ANDROID:8080
```

## Requisitos

- Android com [Termux](https://f-droid.org/packages/com.termux/) (F-Droid ou GitHub —
  **não** use a versão da Play Store, está desatualizada)
- Node.js **>= 22.5** (por causa do módulo nativo `node:sqlite`)
- Opcional, para métricas de bateria: app **Termux:API** + pacote `termux-api`

## 1. Instalar Node.js no Termux

```bash
pkg update
pkg install nodejs
node --version   # deve ser >= v22.5
```

## 2. Instalar o projeto e as dependências

Copie a pasta `android-monitor` para o celular (git, scp, etc.) e:

```bash
cd android-monitor
npm install
```

A única dependência é o Express. Nada é compilado no aparelho.

## 3. Configurar Termux:API (bateria — opcional)

1. Instale o app **Termux:API** da mesma fonte do Termux (F-Droid/GitHub).
2. No Termux:

```bash
pkg install termux-api
termux-battery-status   # deve imprimir um JSON
```

Sem isso, o campo bateria retorna `{"available": false, ...}` e o resto
continua funcionando normalmente.

## 4. Iniciar o servidor

```bash
npm start          # produção
npm run dev        # desenvolvimento (reinicia com --watch)
npm run mock       # dados falsos, para testar sem Android
```

## 5. Descobrir o IP do Android

Qualquer um destes:

```bash
termux-wifi-connectioninfo | grep ip     # requer termux-api
ip route get 8.8.8.8                     # mostra o IP de origem
ifconfig wlan0
```

O próprio dashboard também exibe o IP detectado no card do dispositivo.

## 6. Acessar pelo navegador

Em outro aparelho **na mesma rede local**:

```
http://IP_DO_ANDROID:8080
```

Se não abrir, veja a seção de solução de problemas.

## 7. Configuração (variáveis de ambiente ou `.env`)

Copie `.env.example` para `.env` e ajuste. Variáveis reais têm precedência.

| Variável | Padrão | Descrição |
|---|---|---|
| `PORT` | `8080` | Porta HTTP |
| `HOST` | `0.0.0.0` | Bind address (0.0.0.0 = rede local) |
| `COLLECT_INTERVAL` | `5000` | Coleta em memória (ms) |
| `HISTORY_INTERVAL` | `60000` | Gravação no SQLite (ms) |
| `DATABASE_PATH` | `./data/monitor.db` | Caminho do banco |
| `HISTORY_RETENTION_DAYS` | `7` | Retenção do histórico (dias) |
| `STORAGE_PATH` | `/data` | Mount do armazenamento principal |
| `MOCK_DATA` | — | `1` ativa dados falsos |
| `TERMINAL_ENABLED` | `1` | `0` desativa o terminal web |
| `TERMINAL_TOKEN` | — | Token exigido pelo terminal (recomendado) |
| `TERMINAL_SHELL` | `bash` | Shell do terminal |
| `TERMINAL_IDLE_TIMEOUT` | `600000` | Encerra sessão ociosa (ms) |
| `TERMINAL_MAX_SESSIONS` | `2` | Sessões simultâneas |

Ex.: `PORT=9000 npm start`

## 8. Executar como serviço (inicia com o celular)

Com o app **Termux:Boot** instalado (mesma fonte do Termux):

```bash
pkg install termux-boot
mkdir -p ~/.termux/boot
cat > ~/.termux/boot/android-monitor <<'EOF'
#!/data/data/com.termux/files/usr/bin/sh
termux-wake-lock
cd $HOME/android-monitor
exec npm start >> monitor.log 2>&1
EOF
chmod +x ~/.termux/boot/android-monitor
```

Abra o app Termux:Boot uma vez para ativar. Para parar manualmente:
`termux-wake-unlock` e mate o processo (`pkill -f android-monitor` ou Ctrl+C).

> Dica: desative otimização de bateria para o Termux e Termux:Boot nas
> configurações do Android, senão o sistema pode congelar o processo.

## 9. Solução de problemas

| Sintoma | Causa provável / correção |
|---|---|
| `EADDRINUSE` ao iniciar | Porta ocupada: `PORT=8081 npm start` ou mate o processo anterior |
| Dashboard não abre de outro PC | Celular e PC em redes/VLANs diferentes; AP isolation no roteador; ou Android Doze matou o Termux (`termux-wake-lock`) |
| `history disabled: node:sqlite unavailable` | Node < 22.5 — `pkg upgrade nodejs` |
| Bateria `available: false` | App Termux:API não instalado ou `pkg install termux-api` faltando |
| CPU/RAM `available: false` no Termux | Inesperado — verifique se `/proc/stat` e `/proc/meminfo` são legíveis |
| Histórico vazio no gráfico | Aguarde alguns minutos (snapshot a cada 60s) |
| Processo morre com tela desligada | `termux-wake-lock` + desative otimização de bateria |

Logs: o servidor imprime erros por métrica (`[collector:bateria] ...`) e nunca
derruba o processo por falha individual.

## 10. Acesso via SSH (administração remota)

```bash
pkg install openssh
passwd            # defina uma senha
sshd              # sobe na porta 8022
whoami            # ex.: u0_a123
ifconfig wlan0    # IP do celular
```

Do PC:

```bash
ssh u0_a123@192.168.0.XX -p 8022
```

Para o sshd subir no boot, adicione `sshd` ao script do Termux:Boot (item 8).

## API

Todos os valores de memória/armazenamento em **bytes** (`*Bytes`) e também em
**GB binário** (GiB, `*GB`). Percentuais em 0–100. Temperatura em °C.
Timestamps em ISO-8601 (status) e epoch-ms (histórico). Métrica indisponível →
`{"available": false, "reason": "..."}` (nunca erro 500).

| Endpoint | Conteúdo |
|---|---|
| `GET /api/status` | Snapshot completo (system, cpu, memory, storage, battery, network) |
| `GET /api/system` | Modelo, fabricante, versão Android, kernel, uptime, cores |
| `GET /api/cpu` | `usagePercent` (delta de `/proc/stat`), `loadAverage`, `cores` |
| `GET /api/memory` | RAM total/usada/disponível, swap |
| `GET /api/storage` | `primary` (mount `/data`) + `mounts` (outros, separados) |
| `GET /api/battery` | percentual, status, temperatura, saúde, fonte |
| `GET /api/network` | IP local, interface, todas as IPv4 |
| `GET /api/history?hours=3` | Snapshots persistidos (0.1–168h) |

Teste rápido: `npm run status`

## Terminal web

O dashboard inclui um terminal (`bash -i` via pipes, sem `node-pty`/compilação).
Útil para administrar o aparelho sem SSH. Limitações conscientes: programas
interativos de tela cheia (`vim`, `htop`) não funcionam; comandos comuns
(`pkg install`, `npm`, `ls`, `git`…) funcionam normalmente.

- Fluxo: `POST /api/terminal/start` → SSE `GET /api/terminal/stream/:id` →
  `POST /api/terminal/input/:id` (dados) · `POST /api/terminal/signal/:id`
  (Ctrl+C = SIGINT no grupo do processo) · `POST /api/terminal/stop/:id`
- Sessões ociosas são encerradas após `TERMINAL_IDLE_TIMEOUT` (padrão 10 min);
  máximo de `TERMINAL_MAX_SESSIONS` (padrão 2) — a mais antiga é derrubada.
- Buffer de saída limitado a 256 KB por sessão (replay ao reconectar).

> **SEGURANÇA**: com `TERMINAL_ENABLED=1` e sem `TERMINAL_TOKEN`, **qualquer
> dispositivo na rede local executa comandos como o usuário do Termux**.
> Defina um token no `.env` (o dashboard pede uma vez e guarda na sessão do
> navegador) ou desative com `TERMINAL_ENABLED=0`. Nunca exponha a porta à
> internet — use VPN ou túnel SSH.

## Schema do histórico (SQLite)

```sql
metrics(id, timestamp, cpu_usage, load1, ram_total_bytes, ram_used_bytes,
        ram_available_bytes, ram_percent, swap_used_bytes, storage_used_bytes,
        storage_percent, battery_percent, battery_temp)
```

WAL ativado; limpeza automática por retenção na inicialização.

## Fontes de dados (nenhum comando shell no hot path, exceto bateria)

- CPU: `/proc/stat` (delta entre coletas), `/proc/loadavg`
- RAM/swap: `/proc/meminfo`
- Uptime: `/proc/uptime`
- Storage: `fs.statfsSync()` (statfs direto, sem `df`)
- Rede: `os.networkInterfaces()` (sem `ip`/`ifconfig`)
- Sistema: `getprop` (com fallback para `/system/build.prop`), cacheado
- Bateria: `termux-battery-status` (com cache de 10s; 60s se indisponível)

## Segurança

- Escuta apenas na rede local (`0.0.0.0:8080`); nenhuma outra porta é aberta.
- Sem autenticação, sem armazenamento de credenciais, sem acesso à internet.
- **Não** exponha a porta diretamente à internet. Se precisar de acesso remoto,
  use VPN (WireGuard/Tailscale) ou túnel SSH: `ssh -L 8080:localhost:8080 ...`.
