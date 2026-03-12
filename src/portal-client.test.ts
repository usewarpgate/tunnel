import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PortalClient } from './portal-client.js';
import { TEST_CONFIG, mockResponse } from './test-utils.js';

describe('PortalClient', () => {
    let client: PortalClient;

    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(globalThis, 'fetch');
        client = new PortalClient(TEST_CONFIG);
    });

    it('sends correct Authorization header', async () => {
        vi.mocked(fetch).mockResolvedValue(
            mockResponse({ agent_id: 'a1', servers: [] }),
        );

        await client.connect();

        const [, options] = vi.mocked(fetch).mock.calls[0];
        const headers = options!.headers as Record<string, string>;
        expect(headers['Authorization']).toBe('Bearer tok_test');
    });

    describe('connect', () => {
        it('sends POST to /api/tunnel/connect with metadata', async () => {
            vi.mocked(fetch).mockResolvedValue(
                mockResponse({
                    agent_id: 'agent_1',
                    servers: [
                        {
                            id: 's1',
                            name: 'test-server',
                            target_url: 'http://localhost:3000',
                        },
                    ],
                }),
            );

            const result = await client.connect({
                version: '0.1.0',
                platform: 'darwin',
            });

            const [url, options] = vi.mocked(fetch).mock.calls[0];
            expect(url).toBe(
                'https://portal.example.com/api/tunnel/connect',
            );
            expect(options!.method).toBe('POST');
            expect(JSON.parse(options!.body as string)).toEqual({
                metadata: { version: '0.1.0', platform: 'darwin' },
            });
            expect(result.agent_id).toBe('agent_1');
            expect(result.servers).toHaveLength(1);
        });
    });

    describe('heartbeat', () => {
        it('sends POST to /api/tunnel/heartbeat', async () => {
            vi.mocked(fetch).mockResolvedValue(mockResponse(null));

            await client.heartbeat();

            const [url, options] = vi.mocked(fetch).mock.calls[0];
            expect(url).toBe(
                'https://portal.example.com/api/tunnel/heartbeat',
            );
            expect(options!.method).toBe('POST');
        });
    });

    describe('nextRequest', () => {
        it('returns pending request data', async () => {
            const pendingRequest = {
                request_id: 'req_1',
                target_url: 'http://localhost:3000/mcp',
                method: 'tools/list',
                payload: { jsonrpc: '2.0', method: 'tools/list', id: 1 },
            };

            vi.mocked(fetch).mockResolvedValue(mockResponse(pendingRequest));

            const result = await client.nextRequest();

            const [url] = vi.mocked(fetch).mock.calls[0];
            expect(url).toBe(
                'https://portal.example.com/api/tunnel/requests/next',
            );
            expect(result).toEqual(pendingRequest);
        });

        it('returns null on 204 (no content)', async () => {
            vi.mocked(fetch).mockResolvedValue(
                mockResponse(null, { status: 204 }),
            );

            const result = await client.nextRequest();
            expect(result).toBeNull();
        });

        it('returns null on timeout (DOMException TimeoutError)', async () => {
            const timeoutError = new DOMException(
                'The operation was aborted due to timeout',
                'TimeoutError',
            );
            vi.mocked(fetch).mockRejectedValue(timeoutError);

            const result = await client.nextRequest();
            expect(result).toBeNull();
        });

        it('throws on non-OK non-204 responses', async () => {
            vi.mocked(fetch).mockResolvedValue(
                mockResponse(null, {
                    status: 500,
                    statusText: 'Internal Server Error',
                }),
            );

            await expect(client.nextRequest()).rejects.toThrow(
                'Poll failed: 500 Internal Server Error',
            );
        });

        it('returns null when response has no request_id', async () => {
            vi.mocked(fetch).mockResolvedValue(mockResponse({}));

            const result = await client.nextRequest();
            expect(result).toBeNull();
        });

        it('re-throws non-timeout errors', async () => {
            vi.mocked(fetch).mockRejectedValue(
                new Error('Network unreachable'),
            );

            await expect(client.nextRequest()).rejects.toThrow(
                'Network unreachable',
            );
        });
    });

    describe('respond', () => {
        it('sends POST to /api/tunnel/requests/:id/respond', async () => {
            vi.mocked(fetch).mockResolvedValue(mockResponse(null));

            await client.respond('req_42', {
                response: { jsonrpc: '2.0', result: {}, id: 1 },
            });

            const [url, options] = vi.mocked(fetch).mock.calls[0];
            expect(url).toBe(
                'https://portal.example.com/api/tunnel/requests/req_42/respond',
            );
            expect(options!.method).toBe('POST');
            expect(JSON.parse(options!.body as string)).toEqual({
                response: { jsonrpc: '2.0', result: {}, id: 1 },
            });
        });

        it('sends error responses', async () => {
            vi.mocked(fetch).mockResolvedValue(mockResponse(null));

            await client.respond('req_42', { error: 'Connection refused' });

            const [, options] = vi.mocked(fetch).mock.calls[0];
            expect(JSON.parse(options!.body as string)).toEqual({
                error: 'Connection refused',
            });
        });
    });

    describe('disconnect', () => {
        it('sends POST to /api/tunnel/disconnect', async () => {
            vi.mocked(fetch).mockResolvedValue(mockResponse(null));

            await client.disconnect();

            const [url, options] = vi.mocked(fetch).mock.calls[0];
            expect(url).toBe(
                'https://portal.example.com/api/tunnel/disconnect',
            );
            expect(options!.method).toBe('POST');
        });
    });

    describe('error handling', () => {
        it('includes status and response text in error message', async () => {
            vi.mocked(fetch).mockResolvedValue(
                mockResponse('rate limit exceeded', {
                    status: 429,
                    statusText: 'Too Many Requests',
                }),
            );

            await expect(client.heartbeat()).rejects.toThrow(
                'API POST /heartbeat failed: 429 rate limit exceeded',
            );
        });
    });
});
