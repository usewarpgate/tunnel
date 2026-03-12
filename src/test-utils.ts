import { vi } from 'vitest';
import type { AgentConfig } from './config.js';

export const TEST_CONFIG: AgentConfig = {
    portalUrl: 'https://portal.example.com',
    token: 'tok_test',
    heartbeatInterval: 30_000,
};

export function mockResponse(
    body: unknown,
    options: {
        status?: number;
        statusText?: string;
        contentType?: string;
        headers?: Record<string, string>;
    } = {},
): Response {
    const {
        status = 200,
        statusText = 'OK',
        contentType = 'application/json',
        headers = {},
    } = options;

    const allHeaders = new Headers({
        'Content-Type': contentType,
        ...headers,
    });

    return {
        ok: status >= 200 && status < 300,
        status,
        statusText,
        headers: allHeaders,
        json: async () => body,
        text: async () =>
            body === null || body === undefined
                ? ''
                : typeof body === 'string'
                  ? body
                  : JSON.stringify(body),
        body: { cancel: vi.fn() },
    } as unknown as Response;
}
