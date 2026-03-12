export interface AgentConfig {
    portalUrl: string;
    token: string;
    heartbeatInterval: number;
}

export function resolveConfig(options: {
    url?: string;
    token?: string;
}): AgentConfig {
    const portalUrl =
        options.url || process.env.WARPGATE_URL;
    const token = options.token || process.env.WARPGATE_TOKEN;

    if (!portalUrl) {
        throw new Error(
            'Portal URL is required. Use --url or set WARPGATE_URL.',
        );
    }

    if (!token) {
        throw new Error(
            'Token is required. Use --token or set WARPGATE_TOKEN.',
        );
    }

    return {
        portalUrl: portalUrl.replace(/\/+$/, ''),
        token,
        heartbeatInterval: 30_000,
    };
}
