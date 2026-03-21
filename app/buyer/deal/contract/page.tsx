"use client"

import { ProtectedRoute } from "@/components/layout/protected-route"
import { PageHeader } from "@/components/dashboard/page-header"
import { EmptyState } from "@/components/dashboard/empty-state"
import { LoadingSkeleton } from "@/components/dashboard/loading-skeleton"
import { ErrorState } from "@/components/dashboard/error-state"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Shield, ShieldCheck, ShieldAlert, AlertTriangle, CheckCircle2, ArrowRight, FileText } from "lucide-react"
import Link from "next/link"
import useSWR from "swr"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export default function DealContractPage() {
  const { data: dealData, error: dealError, isLoading: dealLoading } = useSWR("/api/buyer/deal", fetcher)
  const {
    data: shieldData,
    error: shieldError,
    isLoading: shieldLoading,
    mutate,
  } = useSWR("/api/buyer/contract-shield", fetcher)

  const deal = dealData?.data?.deal
  const flags = shieldData?.flags || []
  const isLoading = dealLoading || shieldLoading
  const hasError = dealError || shieldError

  const resolvedCount = flags.filter((f: any) => f.status === "resolved").length
  const totalFlags = flags.length
  const allClear = totalFlags === 0 || resolvedCount === totalFlags

  return (
    <ProtectedRoute allowedRoles={["BUYER"]}>
      <div className="space-y-6">
        <PageHeader
          title="Contract Shield Review"
          subtitle={deal ? "Review contract status for your deal" : "Contract review for your active deal"}
        />

        {isLoading ? (
          <LoadingSkeleton variant="cards" count={3} />
        ) : hasError ? (
          <ErrorState message="Failed to load contract review data" onRetry={() => mutate()} />
        ) : !deal ? (
          <EmptyState
            icon={<FileText className="h-8 w-8 text-muted-foreground" />}
            title="No active deal"
            description="You need an active deal before contract review is available."
            primaryCta={{ label: "Go to Dashboard", href: "/buyer/dashboard" }}
          />
        ) : (
          <>
            {/* Deal Context */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Deal Overview
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Vehicle</span>
                    <p className="font-medium">
                      {deal.vehicle
                        ? `${deal.vehicle.year} ${deal.vehicle.make} ${deal.vehicle.model}`
                        : "Not specified"}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Deal Status</span>
                    <p className="font-medium">{deal.status || "Pending"}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Price</span>
                    <p className="font-medium">
                      {deal.cashOtd
                        ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(deal.cashOtd)
                        : "—"}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Contract Flags</span>
                    <p className="font-medium">
                      {totalFlags} flag{totalFlags !== 1 ? "s" : ""}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Shield Status */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {allClear ? (
                    <ShieldCheck className="h-5 w-5 text-green-600" />
                  ) : (
                    <ShieldAlert className="h-5 w-5 text-amber-600" />
                  )}
                  Contract Shield Status
                  <Badge variant={allClear ? "default" : "secondary"} className="ml-auto">
                    {allClear ? "All Clear" : `${resolvedCount}/${totalFlags} Resolved`}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {totalFlags === 0 ? (
                  <div className="text-center py-6">
                    <Shield className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
                    <p className="text-muted-foreground">
                      No contract flags found. Your contract review will appear here once documents are submitted.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {flags.map((flag: any) => (
                      <div key={flag.id} className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex items-center gap-3">
                          {flag.status === "resolved" ? (
                            <CheckCircle2 className="h-5 w-5 text-green-600" />
                          ) : (
                            <AlertTriangle className="h-5 w-5 text-amber-600" />
                          )}
                          <div>
                            <p className="font-medium text-sm">{flag.type}</p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(flag.createdAt).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        <Badge variant={flag.status === "resolved" ? "default" : "destructive"}>{flag.status}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Action Links */}
            <div className="flex flex-wrap gap-4">
              <Link href="/buyer/contracts">
                <Button variant="outline">
                  <FileText className="h-4 w-4 mr-2" />
                  View All Contracts
                </Button>
              </Link>
              {deal.status === "CONTRACT_APPROVED" || deal.status === "SIGNING_PENDING" ? (
                <Link href="/buyer/deal/esign">
                  <Button>
                    Proceed to E-Sign
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </Link>
              ) : null}
            </div>
          </>
        )}
      </div>
    </ProtectedRoute>
  )
}
