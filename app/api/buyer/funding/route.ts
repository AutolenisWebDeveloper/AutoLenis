import { NextResponse } from "next/server"
import { isTestWorkspace } from "@/lib/app-mode"
import { requireAuth } from "@/lib/auth-server"
import { mockDb } from "@/lib/mocks/mockStore"

export const dynamic = "force-dynamic"

export async function GET() {
  const user = await requireAuth(["BUYER"])

  if (isTestWorkspace(user)) {
    return NextResponse.json({ fundings: mockDb.fundings })
  }
  return NextResponse.json({ fundings: [] })
}
