export class McpForwarder {
    /**
     * Forward a JSON-RPC payload to a local MCP server and return the response.
     */
    async forward(
        targetUrl: string,
        payload: Record<string, unknown>,
    ): Promise<Record<string, unknown>> {
        const sessionId = payload._sessionId as string | undefined;
        const cleanPayload = { ...payload };
        delete cleanPayload._sessionId;

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            Accept: 'application/json, text/event-stream',
        };

        if (sessionId) {
            headers['Mcp-Session-Id'] = sessionId;
        }

        const response = await fetch(targetUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(cleanPayload),
            signal: AbortSignal.timeout(55_000),
        });

        if (!response.ok) {
            const status = `${response.status} ${response.statusText}`;
            await response.body?.cancel();
            throw new Error(`Upstream MCP server error: ${status}`);
        }

        const contentType = response.headers.get('Content-Type') ?? '';

        let result: Record<string, unknown>;

        if (contentType.includes('text/event-stream')) {
            result = await this.parseSse(response);
        } else {
            result = (await response.json()) as Record<string, unknown>;
        }

        // Attach session ID if the upstream provided one
        const upstreamSessionId = response.headers.get('Mcp-Session-Id');
        if (upstreamSessionId) {
            result.sessionId = upstreamSessionId;
        }

        return result;
    }

    private async parseSse(
        response: Response,
    ): Promise<Record<string, unknown>> {
        const body = await response.text();
        let last: Record<string, unknown> = {};

        for (const line of body.split('\n')) {
            if (line.startsWith('data: ')) {
                try {
                    const parsed = JSON.parse(line.slice(6));
                    if (typeof parsed === 'object' && parsed !== null) {
                        last = parsed as Record<string, unknown>;
                    }
                } catch {
                    // skip malformed SSE data lines
                }
            }
        }

        return last;
    }
}
