import type { AgentConfig } from './config.js';
import { McpForwarder } from './mcp-forwarder.js';
import { PortalClient } from './portal-client.js';

export class Agent {
    private portal: PortalClient;
    private forwarder: McpForwarder;
    private config: AgentConfig;
    private running = false;
    private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

    constructor(config: AgentConfig) {
        this.config = config;
        this.portal = new PortalClient(config);
        this.forwarder = new McpForwarder();
    }

    async start(): Promise<void> {
        this.running = true;
        let backoff = 1000;

        while (this.running) {
            try {
                await this.connectAndRun();
                backoff = 1000; // reset on clean exit
            } catch (error) {
                if (!this.running) {
                    break;
                }

                const message =
                    error instanceof Error
                        ? error.message
                        : String(error);
                console.error(`[warpgate] Connection error: ${message}`);
                console.log(
                    `[warpgate] Reconnecting in ${backoff / 1000}s...`,
                );

                await this.sleep(backoff);
                backoff = Math.min(backoff * 2, 30_000);
            }
        }
    }

    async stop(): Promise<void> {
        this.running = false;

        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }

        try {
            await this.portal.disconnect();
            console.log('[warpgate] Disconnected.');
        } catch {
            // best-effort disconnect
        }
    }

    private async connectAndRun(): Promise<void> {
        console.log(
            `[warpgate] Connecting to ${this.config.portalUrl}...`,
        );

        const info = await this.portal.connect({
            version: '0.1.0',
            platform: process.platform,
            nodeVersion: process.version,
        });

        console.log(
            `[warpgate] Connected as ${info.agent_id}. ${info.servers.length} server(s) configured.`,
        );

        for (const server of info.servers) {
            console.log(
                `[warpgate]   - ${server.name} -> ${server.target_url}`,
            );
        }

        // Start heartbeat
        this.heartbeatTimer = setInterval(async () => {
            try {
                await this.portal.heartbeat();
            } catch (error) {
                console.error(
                    '[warpgate] Heartbeat failed:',
                    error instanceof Error
                        ? error.message
                        : String(error),
                );
            }
        }, this.config.heartbeatInterval);

        // Poll loop
        while (this.running) {
            const request = await this.portal.nextRequest();

            if (!request) {
                continue;
            }

            console.log(
                `[warpgate] Received request ${request.request_id}: ${request.method} -> ${request.target_url}`,
            );

            try {
                const response = await this.forwarder.forward(
                    request.target_url,
                    request.payload,
                );

                await this.portal.respond(
                    request.request_id,
                    response,
                );

                console.log(
                    `[warpgate] Responded to ${request.request_id}`,
                );
            } catch (error) {
                const message =
                    error instanceof Error
                        ? error.message
                        : String(error);

                console.error(
                    `[warpgate] Error forwarding ${request.request_id}: ${message}`,
                );

                await this.portal.respondWithError(
                    request.request_id,
                    message,
                );
            }
        }
    }

    private sleep(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}
