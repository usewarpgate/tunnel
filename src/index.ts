#!/usr/bin/env node

import { Command } from 'commander';
import { Agent } from './agent.js';
import { resolveConfig } from './config.js';
import { VERSION } from './version.js';

const program = new Command();

program
    .name('warpgate-tunnel')
    .description(
        'Tunnel agent for Warpgate — relay JSON-RPC requests to local MCP servers on private networks',
    )
    .version(VERSION)
    .option(
        '--url <url>',
        'Warpgate portal URL (or set WARPGATE_URL)',
    )
    .option(
        '--token <token>',
        'Agent authentication token (or set WARPGATE_TOKEN)',
    )
    .action(async (options) => {
        try {
            const config = resolveConfig(options);
            const agent = new Agent(config);

            // Graceful shutdown
            const shutdown = async () => {
                console.log('\n[warpgate] Shutting down...');
                await agent.stop();
                process.exit(0);
            };

            process.on('SIGINT', shutdown);
            process.on('SIGTERM', shutdown);

            await agent.start();
        } catch (error) {
            console.error(
                `Error: ${error instanceof Error ? error.message : String(error)}`,
            );
            process.exit(1);
        }
    });

program.parse();
