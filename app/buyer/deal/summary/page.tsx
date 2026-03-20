"use client"

import { ProtectedRoute } from "@/components/layout/protected-route"
import { PageHeader } from "@/components/dashboard/page-header"
import { EmptyState } from "@/components/dashboard/empty-state"
import { LoadingSkeleton } from "@/components/dashboard/loading-skeleton"
import { ErrorState } from "@/components/dashboard/error-state"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Car,
  DollarSign,
  FileText,
  ShieldCheck,
  Clock,
  ArrowRight,
  Banknote,
  Receipt,
  PenLine,
  QrCode,
} from "lucide-react"
import Link from "next/link"
import useSWR from "swr"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const STATUS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  SELECTED: { label: "Offer Selected", variant: "default" },
  FINANCING_PENDING: { label: "Financing Pending", variant: "secondary" },
  FINANCING_APPROVED: { label: "Financing Approved", variant: "default" },
  FEE_PENDING: { label: "Fee Pending", variant: "secondary" },
  FEE_PAID: { label: "Fee Paid", variant: "default" },
  INSURANCE_PENDING: { label: "Insurance Needed", variant: "secondary" },
  INSURANCE_COMPLETE: { label: "Insurance Verified", variant: "default" },
  CONTRACT_PENDING: { label: "Contract Pending", variant: "secondary" },
  CONTRACT_REVIEW: { label: "Under Review", variant: "secondary" },
  CONTRACT_APPROVED: { label: "Contract Ready", variant: "default" },
  SIGNING_PENDING: { label: "Awaiting Signature", variant: "secondary" },
  SIGNED: { label: "Signed", variant: "default" },
  PICKUP_SCHEDULED: { label: "Pickup Scheduled", variant: "default" },
  COMPLETE: { label: "Complete", variant: "default" },
}

const formatCurrency = (value: number | null | undefined): string => {
  if (value == null) return "—"
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value)
}

const DEAL_STEPS = [
  { key: "financing", label: "Financing", icon: Banknote, href: "/buyer/deal/financing" },
  { key: "fee", label: "Concierge Fee", icon: Receipt, href: "/buyer/deal/fee" },
  { key: "insurance", label: "Insurance", icon: ShieldCheck, href: "/buyer/deal/insurance" },
  { key: "contract", label: "Contract Shield", icon: FileText, href: "/buyer/deal/contract" },
  { key: "esign", label: "E-Sign", icon: PenLine, href: "/buyer/deal/esign" },
  { key: "pickup", label: "Pickup", icon: QrCode, href: "/buyer/deal/pickup" },
]

export default function DealSummaryPage() {
  const { data, error, isLoading, mutate } = useSWR("/api/buyer/deal", fetcher)
  const deal = data?.data?.deal

  const statusInfo = deal?.status ? STATUS_LABELS[deal.status] : null

  return (
    <ProtectedRoute allowedRoles={["BUYER"]}>
      <div className="space-y-6">
        <PageHeader title="Deal Summary" subtitle="Overview of your current deal progress" />

        {isLoading ? (
          <LoadingSkeleton variant="cards" count={3} />
        ) : error ? (
          <ErrorState message="Failed to load deal summary" onRetry={() => mutate()} />
        ) : !deal ? (
          <EmptyState
            icon={<FileText className="h-8 w-8 text-muted-foreground" />}
            title="No active deal"
            description="Start by searching for vehicles and creating an auction to get dealer offers."
            primaryCta={{ label: "Search Vehicles", href: "/buyer/search" }}
          />
        ) : (
          <>
            {/* Vehicle + Status */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Car className="h-5 w-5" />
                    {deal.vehicle
                      ? `${deal.vehicle.year} ${deal.vehicle.make} ${deal.vehicle.model}`
                      : "Vehicle"}
                  </span>
                  {statusInfo && <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Cash OTD</span>
                    <p className="font-medium text-lg">{formatCurrency(deal.cashOtd)}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Financing</span>
                    <p className="font-medium">
                      {deal.financingOption
                        ? `${formatCurrency(deal.financingOption.monthlyPayment)}/mo`
                        : "Not selected"}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Dealer</span>
                    <p className="font-medium">{deal.dealer?.name || "—"}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Created</span>
                    <p className="font-medium">
                      {deal.createdAt ? new Date(deal.createdAt).toLocaleDateString() : "—"}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Deal Steps */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Deal Progress
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {DEAL_STEPS.map((step) => {
                    const Icon = step.icon
                    return (
                      <Link key={step.key} href={step.href}>
                        <div className="flex items-center gap-3 p-3 border rounded-lg hover:bg-accent transition-colors cursor-pointer">
                          <Icon className="h-5 w-5 text-muted-foreground" />
                          <span className="font-medium text-sm">{step.label}</span>
                          <ArrowRight className="h-4 w-4 ml-auto text-muted-foreground" />
                        </div>
                      </Link>
                    )
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Quick Actions */}
            <div className="flex flex-wrap gap-4">
              <Link href="/buyer/deal">
                <Button variant="outline">
                  <DollarSign className="h-4 w-4 mr-2" />
                  Deal Details
                </Button>
              </Link>
              <Link href="/buyer/contracts">
                <Button variant="outline">
                  <FileText className="h-4 w-4 mr-2" />
                  View Contracts
                </Button>
              </Link>
            </div>
          </>
        )}
      </div>
    </ProtectedRoute>
  )
}
