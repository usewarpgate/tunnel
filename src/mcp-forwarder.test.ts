import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpForwarder } from './mcp-forwarder.js';
import { mockResponse } from './test-utils.js';

describe('McpForwarder', () => {
    let forwarder: McpForwarder;

    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(globalThis, 'fetch');
        forwarder = new McpForwarder();
    });

    describe('forward', () => {
        it('forwards a JSON-RPC payload and returns the response', async () => {
            const responseBody = { jsonrpc: '2.0', result: { ok: true }, id: 1 };
            vi.mocked(fetch).mockResolvedValue(mockResponse(responseBody));

            const result = await forwarder.forward(
                'http://localhost:3000/mcp',
                { jsonrpc: '2.0', method: 'tools/list', id: 1 },
            );

            expect(result).toEqual(responseBody);
            expect(fetch).toHaveBeenCalledWith('http://localhost:3000/mcp', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json, text/event-stream',
                },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'tools/list',
                    id: 1,
                }),
                signal: expect.any(AbortSignal),
            });
        });

        it('removes _sessionId from payload and sends it as a header', async () => {
            vi.mocked(fetch).mockResolvedValue(
                mockResponse({ jsonrpc: '2.0', result: {}, id: 1 }),
            );

            await forwarder.forward('http://localhost:3000/mcp', {
                jsonrpc: '2.0',
                method: 'tools/call',
                id: 2,
                _sessionId: 'sess_abc',
            });

            const [, options] = vi.mocked(fetch).mock.calls[0];
            const headers = options!.headers as Record<string, string>;
            const body = JSON.parse(options!.body as string);

            expect(headers['Mcp-Session-Id']).toBe('sess_abc');
            expect(body._sessionId).toBeUndefined();
        });

        it('does not set Mcp-Session-Id header when no session ID in payload', async () => {
            vi.mocked(fetch).mockResolvedValue(
                mockResponse({ jsonrpc: '2.0', result: {}, id: 1 }),
            );

            await forwarder.forward('http://localhost:3000/mcp', {
                jsonrpc: '2.0',
                method: 'tools/list',
                id: 1,
            });

            const [, options] = vi.mocked(fetch).mock.calls[0];
            const headers = options!.headers as Record<string, string>;

            expect(headers['Mcp-Session-Id']).toBeUndefined();
        });

        it('throws on non-OK upstream response', async () => {
            vi.mocked(fetch).mockResolvedValue(
                mockResponse(null, { status: 502, statusText: 'Bad Gateway' }),
            );

            await expect(
                forwarder.forward('http://localhost:3000/mcp', {
                    jsonrpc: '2.0',
                    method: 'tools/list',
                    id: 1,
                }),
            ).rejects.toThrow('Upstream MCP server error: 502 Bad Gateway');
        });

        it('parses SSE responses when content-type is text/event-stream', async () => {
            const sseBody = [
                'event: message',
                'data: {"jsonrpc":"2.0","result":{"tools":[]},"id":1}',
                '',
            ].join('\n');

            vi.mocked(fetch).mockResolvedValue(
                mockResponse(sseBody, { contentType: 'text/event-stream' }),
            );

            const result = await forwarder.forward(
                'http://localhost:3000/mcp',
                { jsonrpc: '2.0', method: 'tools/list', id: 1 },
            );

            expect(result).toEqual({
                jsonrpc: '2.0',
                result: { tools: [] },
                id: 1,
            });
        });

        it('attaches upstream session ID from response headers', async () => {
            vi.mocked(fetch).mockResolvedValue(
                mockResponse(
                    { jsonrpc: '2.0', result: {}, id: 1 },
                    { headers: { 'Mcp-Session-Id': 'upstream_sess_xyz' } },
                ),
            );

            const result = await forwarder.forward(
                'http://localhost:3000/mcp',
                { jsonrpc: '2.0', method: 'initialize', id: 1 },
            );

            expect(result.sessionId).toBe('upstream_sess_xyz');
        });
    });

    describe('parseSse (via forward)', () => {
        it('returns the last valid JSON from multiple data lines', async () => {
            const sseBody = [
                'data: {"jsonrpc":"2.0","method":"notifications/progress","params":{}}',
                'data: {"jsonrpc":"2.0","result":{"final":true},"id":1}',
                '',
            ].join('\n');

            vi.mocked(fetch).mockResolvedValue(
                mockResponse(sseBody, { contentType: 'text/event-stream' }),
            );

            const result = await forwarder.forward(
                'http://localhost:3000/mcp',
                { jsonrpc: '2.0', method: 'tools/call', id: 1 },
            );

            expect(result).toEqual({
                jsonrpc: '2.0',
                result: { final: true },
                id: 1,
            });
        });

        it('skips malformed data lines gracefully', async () => {
            const sseBody = [
                'data: not-valid-json',
                'data: {"jsonrpc":"2.0","result":{},"id":1}',
                'data: also {broken',
                '',
            ].join('\n');

            vi.mocked(fetch).mockResolvedValue(
                mockResponse(sseBody, { contentType: 'text/event-stream' }),
            );

            const result = await forwarder.forward(
                'http://localhost:3000/mcp',
                { jsonrpc: '2.0', method: 'tools/call', id: 1 },
            );

            // Last valid JSON was the second line
            expect(result).toEqual({
                jsonrpc: '2.0',
                result: {},
                id: 1,
            });
        });

        it('returns empty object when SSE has no data lines', async () => {
            const sseBody = [
                'event: ping',
                ': comment',
                '',
            ].join('\n');

            vi.mocked(fetch).mockResolvedValue(
                mockResponse(sseBody, { contentType: 'text/event-stream' }),
            );

            const result = await forwarder.forward(
                'http://localhost:3000/mcp',
                { jsonrpc: '2.0', method: 'tools/call', id: 1 },
            );

            expect(result).toEqual({});
        });
    });
});
