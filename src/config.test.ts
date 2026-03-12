import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolveConfig } from './config.js';

describe('resolveConfig', () => {
    let savedUrl: string | undefined;
    let savedToken: string | undefined;

    beforeEach(() => {
        savedUrl = process.env.WARPGATE_URL;
        savedToken = process.env.WARPGATE_TOKEN;
        delete process.env.WARPGATE_URL;
        delete process.env.WARPGATE_TOKEN;
    });

    afterEach(() => {
        if (savedUrl !== undefined) process.env.WARPGATE_URL = savedUrl;
        else delete process.env.WARPGATE_URL;
        if (savedToken !== undefined) process.env.WARPGATE_TOKEN = savedToken;
        else delete process.env.WARPGATE_TOKEN;
    });

    it('resolves config from CLI options', () => {
        const config = resolveConfig({
            url: 'https://portal.example.com',
            token: 'tok_abc123',
        });

        expect(config).toEqual({
            portalUrl: 'https://portal.example.com',
            token: 'tok_abc123',
            heartbeatInterval: 30_000,
        });
    });

    it('falls back to environment variables', () => {
        process.env.WARPGATE_URL = 'https://env.example.com';
        process.env.WARPGATE_TOKEN = 'tok_env';

        const config = resolveConfig({});

        expect(config.portalUrl).toBe('https://env.example.com');
        expect(config.token).toBe('tok_env');
    });

    it('CLI options take precedence over env vars', () => {
        process.env.WARPGATE_URL = 'https://env.example.com';
        process.env.WARPGATE_TOKEN = 'tok_env';

        const config = resolveConfig({
            url: 'https://cli.example.com',
            token: 'tok_cli',
        });

        expect(config.portalUrl).toBe('https://cli.example.com');
        expect(config.token).toBe('tok_cli');
    });

    it('strips trailing slashes from portal URL', () => {
        const config = resolveConfig({
            url: 'https://portal.example.com///',
            token: 'tok_abc',
        });

        expect(config.portalUrl).toBe('https://portal.example.com');
    });

    it('throws when portal URL is missing', () => {
        expect(() => resolveConfig({ token: 'tok_abc' })).toThrow(
            'Portal URL is required',
        );
    });

    it('throws when token is missing', () => {
        expect(() =>
            resolveConfig({ url: 'https://portal.example.com' }),
        ).toThrow('Token is required');
    });
});
