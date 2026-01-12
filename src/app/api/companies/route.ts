import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
    if (!process.env.BACKEND_BASE_URL) {
        return new Response("BACKEND_BASE_URL missing", { status: 500 });
    }

    try {
        const authHeader = request.headers.get('authorization');
        const body = await request.json();

        const response = await fetch(`${process.env.BACKEND_BASE_URL}/api/companies`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(authHeader && { 'Authorization': authHeader }),
            },
            body: JSON.stringify(body),
        });

        const data = await response.json();

        return NextResponse.json(data, { status: response.status });
    } catch (error) {
        return NextResponse.json(
            { error: 'Failed to create company' },
            { status: 500 }
        );
    }
}
