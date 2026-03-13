import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Agent } from './agent.js';
import { TEST_CONFIG } from './test-utils.js';

// Mock dependencies — vi.mock hoists to top, so we use factory functions
// that return class constructors (not plain functions) to satisfy `new`.
vi.mock('./portal-client.js', () => {
    const PortalClient = vi.fn(function (this: any) {
        this.connect = vi.fn();
        this.heartbeat = vi.fn();
        this.nextRequest = vi.fn();
        this.respond = vi.fn();
        this.disconnect = vi.fn();
    });
    return { PortalClient };
});

vi.mock('./mcp-forwarder.js', () => {
    const McpForwarder = vi.fn(function (this: any) {
        this.forward = vi.fn();
    });
    return { McpForwarder };
});

vi.mock('./version.js', () => ({ VERSION: '0.0.0-test' }));

function getPortalMock(agent: Agent) {
    return (agent as any).portal;
}

function getForwarderMock(agent: Agent) {
    return (agent as any).forwarder;
}

describe('Agent', () => {
    let agent: Agent;

    beforeEach(() => {
        vi.useFakeTimers();
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
        agent = new Agent(TEST_CONFIG);

        // Default: successful connection with no servers
        const portal = getPortalMock(agent);
        portal.connect.mockResolvedValue({
            agent_id: 'agent_1',
            servers: [],
        });
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('connects to portal with system metadata', async () => {
        const portal = getPortalMock(agent);
        let callCount = 0;

        portal.nextRequest.mockImplementation(async () => {
            callCount++;
            if (callCount >= 1) await agent.stop();
            return null;
        });

        await agent.start();

        expect(portal.connect).toHaveBeenCalledWith(
            expect.objectContaining({
                version: '0.0.0-test',
                platform: process.platform,
                nodeVersion: process.version,
            }),
        );
    });

    it('forwards requests from portal to local MCP server', async () => {
        const portal = getPortalMock(agent);
        const forwarder = getForwarderMock(agent);

        portal.connect.mockResolvedValue({
            agent_id: 'agent_1',
            servers: [{ id: 's1', name: 'test', target_url: 'http://localhost:3000' }],
        });

        const pendingRequest = {
            request_id: 'req_1',
            target_url: 'http://localhost:3000/mcp',
            method: 'tools/list',
            payload: { jsonrpc: '2.0', method: 'tools/list', id: 1 },
        };

        let callCount = 0;
        portal.nextRequest.mockImplementation(async () => {
            callCount++;
            if (callCount === 1) return pendingRequest;
            await agent.stop();
            return null;
        });

        forwarder.forward.mockResolvedValue({
            jsonrpc: '2.0',
            result: { tools: [] },
            id: 1,
        });

        await agent.start();

        expect(forwarder.forward).toHaveBeenCalledWith(
            'http://localhost:3000/mcp',
            pendingRequest.payload,
        );

        expect(portal.respond).toHaveBeenCalledWith('req_1', {
            response: { jsonrpc: '2.0', result: { tools: [] }, id: 1 },
        });
    });

    it('sends error response when forwarding fails', async () => {
        const portal = getPortalMock(agent);
        const forwarder = getForwarderMock(agent);

        let callCount = 0;
        portal.nextRequest.mockImplementation(async () => {
            callCount++;
            if (callCount === 1) {
                return {
                    request_id: 'req_1',
                    target_url: 'http://localhost:3000/mcp',
                    method: 'tools/call',
                    payload: { jsonrpc: '2.0', method: 'tools/call', id: 1 },
                };
            }
            await agent.stop();
            return null;
        });

        forwarder.forward.mockRejectedValue(new Error('Connection refused'));

        await agent.start();

        expect(portal.respond).toHaveBeenCalledWith('req_1', {
            error: 'Connection refused',
        });
    });

    it('starts and clears heartbeat timer', async () => {
        const portal = getPortalMock(agent);

        let callCount = 0;
        portal.nextRequest.mockImplementation(async () => {
            callCount++;
            if (callCount === 1) {
                // Advance timers to trigger heartbeat
                vi.advanceTimersByTime(30_000);
                return null;
            }
            await agent.stop();
            return null;
        });

        await agent.start();

        expect(portal.heartbeat).toHaveBeenCalled();
        // After stop, the heartbeat timer should be cleared
        expect((agent as any).heartbeatTimer).toBeNull();
    });

    it('disconnects from portal on stop', async () => {
        const portal = getPortalMock(agent);

        portal.nextRequest.mockImplementation(async () => {
            await agent.stop();
            return null;
        });

        await agent.start();

        expect(portal.disconnect).toHaveBeenCalled();
    });

    it('retries on connection error', async () => {
        const portal = getPortalMock(agent);
        let attempt = 0;

        portal.connect.mockImplementation(async () => {
            attempt++;
            if (attempt <= 2) {
                throw new Error('Connection failed');
            }
            return { agent_id: 'agent_1', servers: [] };
        });

        portal.nextRequest.mockImplementation(async () => {
            await agent.stop();
            return null;
        });

        await agent.start();

        // Agent should have retried twice then succeeded on attempt 3
        expect(attempt).toBe(3);
        expect(portal.connect).toHaveBeenCalledTimes(3);
    });

    it('skips null requests from long-poll', async () => {
        const portal = getPortalMock(agent);
        const forwarder = getForwarderMock(agent);

        let callCount = 0;
        portal.nextRequest.mockImplementation(async () => {
            callCount++;
            if (callCount <= 3) return null; // 3 empty polls
            await agent.stop();
            return null;
        });

        await agent.start();

        expect(forwarder.forward).not.toHaveBeenCalled();
    });
});
