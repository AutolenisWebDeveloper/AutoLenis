"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Shield, Upload, Clock, HelpCircle, AlertTriangle, CheckCircle2 } from "lucide-react"
import { csrfHeaders } from "@/lib/csrf-client"
import useSWR from "swr"

const fetcher = (url: string) => fetch(url).then((res) => res.json())

type QueueRecord = {
  dealId: string
  buyerId: string
  insuranceStatus: string
  uploadPresent: boolean
  deliveryBlockFlag: boolean
  updatedAt: string
}

function QueueTable({
  title,
  icon: Icon,
  records,
  showVerifyAction,
  onVerify,
}: {
  title: string
  icon: React.ElementType
  records: QueueRecord[]
  showVerifyAction?: boolean
  onVerify?: (dealId: string, decision: "VERIFIED" | "REQUIRED_BEFORE_DELIVERY") => void
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Icon className="h-5 w-5" />
          {title}
          <Badge variant="secondary" className="ml-auto">
            {records.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {records.length === 0 ? (
          <div className="p-6 text-center text-muted-foreground text-sm">No items in queue</div>
        ) : (
          <div className="w-full overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Deal ID</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Buyer ID</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Upload</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Updated</th>
                  {showVerifyAction && (
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y">
                {records.map((record) => (
                  <tr key={record.dealId} className="hover:bg-accent/50">
                    <td className="px-4 py-3 text-sm font-mono">{record.dealId.slice(0, 12)}...</td>
                    <td className="px-4 py-3 text-sm font-mono">{record.buyerId.slice(0, 12)}...</td>
                    <td className="px-4 py-3">
                      <Badge variant={record.insuranceStatus === "VERIFIED" ? "default" : "secondary"}>
                        {record.insuranceStatus.replace(/_/g, " ")}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {record.uploadPresent ? (
                        <span className="text-green-600">Yes</span>
                      ) : (
                        <span className="text-muted-foreground">No</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {record.updatedAt ? new Date(record.updatedAt).toLocaleDateString() : "-"}
                    </td>
                    {showVerifyAction && onVerify && (
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => onVerify(record.dealId, "VERIFIED")}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                            Verify
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onVerify(record.dealId, "REQUIRED_BEFORE_DELIVERY")}
                          >
                            Require Before Delivery
                          </Button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default function AdminInsurancePage() {
  const { data, isLoading, mutate } = useSWR("/api/admin/insurance/queues", fetcher, {
    refreshInterval: 30000,
  })

  const queues = data?.data || {
    uploadedProof: [],
    pendingInsurance: [],
    helpRequests: [],
    deliveryBlocked: [],
  }

  const handleVerify = async (dealId: string, decision: "VERIFIED" | "REQUIRED_BEFORE_DELIVERY") => {
    try {
      const res = await fetch("/api/admin/insurance/review", {
        method: "POST",
        headers: { ...csrfHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ dealId, decision }),
      })
      const result = await res.json()
      if (result.success) {
        // Refresh queues after action
        mutate()
      }
    } catch (error) {
      console.error("Failed to review insurance:", error)
    }
  }

  const totalItems = queues.uploadedProof.length + queues.pendingInsurance.length +
    queues.helpRequests.length + queues.deliveryBlocked.length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Insurance Queues</h1>
        <p className="text-muted-foreground">Review and manage buyer insurance submissions</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Upload className="h-6 w-6 text-blue-500" />
              <div>
                <p className="text-2xl font-bold">{queues.uploadedProof.length}</p>
                <p className="text-xs text-muted-foreground">Awaiting Review</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Clock className="h-6 w-6 text-amber-500" />
              <div>
                <p className="text-2xl font-bold">{queues.pendingInsurance.length}</p>
                <p className="text-xs text-muted-foreground">Pending Insurance</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <HelpCircle className="h-6 w-6 text-purple-500" />
              <div>
                <p className="text-2xl font-bold">{queues.helpRequests.length}</p>
                <p className="text-xs text-muted-foreground">Help Requests</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-6 w-6 text-red-500" />
              <div>
                <p className="text-2xl font-bold">{queues.deliveryBlocked.length}</p>
                <p className="text-xs text-muted-foreground">Delivery Blocked</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <div className="p-8 text-center text-muted-foreground">Loading insurance queues...</div>
      ) : totalItems === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-8">
              <Shield className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">All insurance queues are clear</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          <QueueTable
            title="Uploaded Proof Review"
            icon={Upload}
            records={queues.uploadedProof}
            showVerifyAction
            onVerify={handleVerify}
          />
          <QueueTable
            title="Pending Insurance Follow-up"
            icon={Clock}
            records={queues.pendingInsurance}
          />
          <QueueTable
            title="Help Requests"
            icon={HelpCircle}
            records={queues.helpRequests}
          />
          <QueueTable
            title="Delivery Blocked"
            icon={AlertTriangle}
            records={queues.deliveryBlocked}
            showVerifyAction
            onVerify={handleVerify}
          />
        </div>
      )}
    </div>
  )
}
