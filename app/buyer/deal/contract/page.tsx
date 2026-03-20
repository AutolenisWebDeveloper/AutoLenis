import { redirect } from "next/navigation"

/**
 * /buyer/deal/contract — Contract Shield step within the deal workflow.
 *
 * The full Contract Shield review UI lives at /buyer/contracts.
 * This page performs a server-side redirect so users navigating through
 * the deal sidebar land on the real contract review page without
 * a client-side flash or spinner.
 */
export default function DealContractPage() {
  redirect("/buyer/contracts")
}
