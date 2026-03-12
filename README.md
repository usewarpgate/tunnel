# @usewarpgate/tunnel

A lightweight CLI agent that connects MCP servers running on private networks to [Warpgate](https://usewarpgate.com). No inbound ports needed — the agent dials out over HTTPS and relays JSON-RPC requests to local MCP servers.

## How It Works

```
[Private Network]                         [Warpgate]

local MCP server <-- Tunnel Agent ===HTTPS===> /api/tunnel/*
  (localhost:3000)    (this CLI)                    |
                                           Portal queues request,
                                           agent picks it up via long-poll,
                                           forwards to local server,
                                           POSTs response back
```

All traffic flows **outbound** from your private network — no inbound firewall rules required.

## Quick Start

```bash
npx @usewarpgate/tunnel \
  --url https://your-portal.example.com \
  --token tun_YOUR_TOKEN_HERE
```

Or using environment variables:

```bash
export WARPGATE_URL=https://your-portal.example.com
export WARPGATE_TOKEN=tun_YOUR_TOKEN_HERE
npx @usewarpgate/tunnel
```

## Requirements

- Node.js 18 or later
- Outbound HTTPS access to your Warpgate portal

## Setup

1. In your Warpgate portal, go to **Tunnel Agents** > **Create Agent**
2. Copy the generated token (it's only shown once)
3. Add MCP servers with **Tunnel** transport, selecting the agent and entering the local target URL
4. Run the tunnel agent in your private network

## CLI Options

| Option | Env Variable | Description |
|--------|-------------|-------------|
| `--url <url>` | `WARPGATE_URL` | Warpgate portal URL |
| `--token <token>` | `WARPGATE_TOKEN` | Agent authentication token |

## Behavior

- **Heartbeat**: sent every 30 seconds to indicate the agent is alive
- **Reconnection**: on connection failure, retries with exponential backoff (1s → 2s → 4s → max 30s)
- **Graceful shutdown**: on `SIGINT` / `SIGTERM` (Ctrl+C), the agent notifies the portal before exiting

## Security

- The agent only forwards requests for servers explicitly configured to use it
- All communication uses HTTPS
- Tokens are hashed (SHA-256) before storage on the server — the plain-text token is only shown once
- The agent never exposes local MCP servers to the internet directly

## Development

```bash
git clone https://github.com/usewarpgate/tunnel.git
cd tunnel
npm install
npm run dev -- --url https://your-portal.test --token tun_YOUR_TOKEN
```

Build:

```bash
npm run build
```

## License

MIT
