import { NextResponse } from "next/server";
import { isRevision, verifyRevision } from "@/lib/memento/verification";
export const runtime = "nodejs";
export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Expected a JSON revision." }, { status: 400 }); }
  if (!body || typeof body !== "object" || !("revision" in body) || !isRevision(body.revision)) {
    return NextResponse.json({ error: "Choose an available sample revision." }, { status: 400 });
  }
  try { return NextResponse.json(await verifyRevision(body.revision), { headers: { "Cache-Control": "no-store" } }); }
  catch { return NextResponse.json({ error: "Verification could not complete. Retry the run." }, { status: 500 }); }
}
