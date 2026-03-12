import type { AgentConfig } from './config.js';

export interface ConnectResponse {
    agent_id: string;
    servers: { id: string; name: string; target_url: string }[];
}

export interface PendingRequest {
    request_id: string;
    target_url: string;
    method: string;
    payload: Record<string, unknown>;
}

export class PortalClient {
    private baseUrl: string;
    private token: string;

    constructor(config: AgentConfig) {
        this.baseUrl = `${config.portalUrl}/api/tunnel`;
        this.token = config.token;
    }

    async connect(
        metadata?: Record<string, unknown>,
    ): Promise<ConnectResponse> {
        const response = await this.request('POST', '/connect', {
            metadata,
        });
        return response as ConnectResponse;
    }

    async heartbeat(): Promise<void> {
        await this.request('POST', '/heartbeat');
    }

    async nextRequest(): Promise<PendingRequest | null> {
        try {
            const response = await fetch(
                `${this.baseUrl}/requests/next`,
                {
                    method: 'GET',
                    headers: this.headers(),
                    signal: AbortSignal.timeout(35_000),
                },
            );

            if (response.status === 204) {
                return null;
            }

            if (!response.ok) {
                throw new Error(
                    `Poll failed: ${response.status} ${response.statusText}`,
                );
            }

            const data = await response.json();
            return data.request_id ? (data as PendingRequest) : null;
        } catch (error) {
            if (
                error instanceof DOMException &&
                error.name === 'TimeoutError'
            ) {
                return null;
            }
            throw error;
        }
    }

    async respond(
        requestId: string,
        body: { response?: Record<string, unknown>; error?: string },
    ): Promise<void> {
        await this.request(
            'POST',
            `/requests/${requestId}/respond`,
            body,
        );
    }

    async disconnect(): Promise<void> {
        await this.request('POST', '/disconnect');
    }

    private headers(): Record<string, string> {
        return {
            Authorization: `Bearer ${this.token}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
        };
    }

    private async request(
        method: 'GET' | 'POST',
        path: string,
        body?: Record<string, unknown>,
    ): Promise<unknown> {
        const response = await fetch(`${this.baseUrl}${path}`, {
            method,
            headers: this.headers(),
            body: body ? JSON.stringify(body) : undefined,
        });

        if (!response.ok) {
            const text = await response.text().catch(() => '');
            throw new Error(
                `API ${method} ${path} failed: ${response.status} ${text}`,
            );
        }

        const text = await response.text();
        return text ? JSON.parse(text) : {};
    }
}
