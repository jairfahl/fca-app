#!/usr/bin/env node

const http = require('http');

const CONFIG = {
    baseUrl: 'http://localhost:3001',
    endpoints: [
        {
            method: 'GET',
            path: '/health',
            name: 'Health Check',
            expectStatus: 200,
            expectJson: true,
            validate: (body) => body.ok === true
        },
        {
            method: 'GET',
            path: '/api/cycles/active',
            name: 'Get Active Cycle',
            expectStatus: [200, 404],
            expectJson: true,
            validate: (body) => typeof body.active === 'boolean'
        },
        {
            method: 'POST',
            path: '/api/companies',
            name: 'Create Company (Validation)',
            body: {}, // Empty body to trigger validation
            expectStatus: 400,
            expectJson: true,
            validate: (body) => body.error === 'ValidationError'
        },
        {
            method: 'GET',
            path: '/api/companies/me',
            name: 'Get Company Me (Unauthorized)',
            expectStatus: 401,
            expectJson: true,
            validate: (body) => body.error === 'Unauthorized'
        },
        {
            method: 'GET',
            path: '/api/__invalid_route__',
            name: '404 Contract Check',
            expectStatus: 404,
            expectJson: true,
            validate: (body) => body.error === 'NotFound'
        }
    ]
};

async function runRequest(endpoint) {
    return new Promise((resolve) => {
        const options = {
            method: endpoint.method,
            headers: {
                'Content-Type': 'application/json'
            }
        };

        const req = http.request(`${CONFIG.baseUrl}${endpoint.path}`, options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                const result = {
                    name: endpoint.name,
                    path: endpoint.path,
                    method: endpoint.method,
                    status: res.statusCode,
                    success: false,
                    error: null
                };

                // Check status
                const expected = Array.isArray(endpoint.expectStatus)
                    ? endpoint.expectStatus
                    : [endpoint.expectStatus];

                if (!expected.includes(res.statusCode)) {
                    result.error = `Expected status ${expected.join('|')}, got ${res.statusCode}`;
                    resolve(result);
                    return;
                }

                // Check JSON content type
                if (endpoint.expectJson) {
                    const contentType = res.headers['content-type'] || '';
                    if (!contentType.includes('application/json')) {
                        result.error = `Expected application/json, got ${contentType}`;
                        resolve(result);
                        return;
                    }
                }

                // Check Validation
                if (endpoint.validate) {
                    try {
                        const json = JSON.parse(data);
                        if (!endpoint.validate(json)) {
                            result.error = `Validation function failed on body: ${data.substring(0, 100)}...`;
                        } else {
                            result.success = true;
                        }
                    } catch (e) {
                        result.error = `Invalid JSON Body: ${e.message}`;
                    }
                } else {
                    result.success = true;
                }

                resolve(result);
            });
        });

        req.on('error', (e) => {
            resolve({
                name: endpoint.name,
                success: false,
                error: `Network Error: ${e.message}`
            });
        });

        if (endpoint.body) {
            req.write(JSON.stringify(endpoint.body));
        }
        req.end();
    });
}

async function runAll() {
    console.log(`running QA API Tests against ${CONFIG.baseUrl}...\n`);
    let passed = 0;
    let failed = 0;

    for (const endpoint of CONFIG.endpoints) {
        const result = await runRequest(endpoint);
        if (result.success) {
            console.log(`[PASS] ${result.name} (${result.method} ${result.path})`);
            passed++;
        } else {
            console.log(`[FAIL] ${result.name} (${result.method} ${result.path})`);
            console.log(`       Reason: ${result.error}`);
            failed++;
        }
    }

    console.log(`\nSummary: ${passed} PASS, ${failed} FAIL`);

    if (failed > 0) {
        process.exit(1);
    }
}

runAll();
