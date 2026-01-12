import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
    const backendBaseUrl = process.env.BACKEND_BASE_URL

    // Handle case where env var might be missing
    if (!backendBaseUrl) {
        return NextResponse.json({
            backendBaseUrl: null,
            healthFetch: {
                ok: false,
                status: 0,
                bodySnippet: 'BACKEND_BASE_URL is not defined in environment'
            }
        })
    }

    const healthUrl = `${backendBaseUrl}/health`

    try {
        // Set a timeout to avoid hanging indefinitely if backend is down
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 3000)

        const res = await fetch(healthUrl, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            cache: 'no-store',
            signal: controller.signal
        })

        clearTimeout(timeoutId)

        const status = res.status
        let bodySnippet = ''
        try {
            const text = await res.text()
            // Try to parse as JSON first to keep it clean, otherwise return substring
            try {
                const json = JSON.parse(text)
                bodySnippet = JSON.stringify(json)
            } catch {
                bodySnippet = text.slice(0, 200)
            }
        } catch (e) {
            bodySnippet = 'Failed to read body'
        }

        return NextResponse.json({
            backendBaseUrl,
            healthFetch: {
                ok: res.ok,
                status,
                bodySnippet
            }
        })
    } catch (error: any) {
        return NextResponse.json({
            backendBaseUrl,
            healthFetch: {
                ok: false,
                status: 0,
                bodySnippet: error.message || 'Fetch failed'
            }
        })
    }
}
