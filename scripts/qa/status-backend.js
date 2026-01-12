#!/usr/bin/env node

const { execSync } = require('child_process');

try {
    // Use lsof to find processes listening on port 3001
    const output = execSync('lsof -nP -iTCP:3001 -sTCP:LISTEN 2>/dev/null || true', { encoding: 'utf-8' });

    if (!output.trim()) {
        console.log('No process listening on port 3001');
        process.exit(0);
    }

    console.log('Processes listening on port 3001:');
    console.log(output);
} catch (error) {
    console.error('Error checking backend status:', error.message);
    process.exit(1);
}
