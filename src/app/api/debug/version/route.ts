import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    version: '672e6b0-with-timeout-config',
    timestamp: new Date().toISOString(),
  });
}
