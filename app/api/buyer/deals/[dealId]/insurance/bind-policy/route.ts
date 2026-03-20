import { NextResponse } from "next/server"
import { getSessionUser } from "@/lib/auth-server"

export async function POST(_request: Request, { params: _params }: { params: Promise<{ dealId: string }> }) {
  try {
    const user = await getSessionUser()
    if (!user || user.role !== "BUYER") {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }
  } catch {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  return NextResponse.json(
    {
      success: false,
      error: "Insurance policy binding is not available. Please upload proof of your existing insurance coverage instead.",
    },
    { status: 410 },
  )
}
