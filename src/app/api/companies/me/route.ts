import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
    if (!process.env.BACKEND_BASE_URL) {
        return new Response("BACKEND_BASE_URL missing", { status: 500 });
    }

    try {
        const authHeader = request.headers.get('authorization');

        const response = await fetch(`${process.env.BACKEND_BASE_URL}/api/companies/me`, {
            headers: {
                ...(authHeader && { 'Authorization': authHeader }),
            },
        });

        const data = await response.json();

        return NextResponse.json(data, { status: response.status });
    } catch (error) {
        return NextResponse.json(
            { error: 'Failed to fetch company' },
            { status: 500 }
        );
    }
}
