"use client"

import { useState, useEffect, useCallback } from "react"
import { ProtectedRoute } from "@/components/layout/protected-route"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/hooks/use-toast"
import { csrfHeaders } from "@/lib/csrf-client"
import { useRouter } from "next/navigation"
import { Shield, Upload, Clock, HelpCircle, CheckCircle2, ArrowRight } from "lucide-react"

/**
 * Three-path buyer insurance page:
 *   A. Upload current insurance (file upload: PDF, PNG, JPG, JPEG)
 *   B. Continue with insurance pending (acknowledge required before delivery)
 *   C. Request help with insurance
 *
 * This page does NOT block the buyer journey — it is reachable from the
 * dashboard but is not a gate for shopping, shortlist, or auction.
 */

type InsurancePath = "upload" | "pending" | "help"

const DOCUMENT_TYPES = [
  { value: "INSURANCE_CARD", label: "Insurance Card" },
  { value: "INSURANCE_DECLARATIONS", label: "Insurance Declarations Page" },
  { value: "INSURANCE_BINDER", label: "Insurance Binder" },
  { value: "INSURANCE_OTHER", label: "Other Proof of Coverage" },
] as const

export default function BuyerInsurancePage() {
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [hasDeal, setHasDeal] = useState(false)
  const [currentStatus, setCurrentStatus] = useState<string | null>(null)
  const [selectedPath, setSelectedPath] = useState<InsurancePath>("upload")
  const [documentType, setDocumentType] = useState<string>("INSURANCE_CARD")
  const [completed, setCompleted] = useState(false)
  const { toast } = useToast()
  const router = useRouter()

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/buyer/insurance")
      const data = await res.json()
      if (data.success) {
        setHasDeal(data.data.hasDeal)
        setCurrentStatus(data.data.insuranceStatus)
      }
    } catch {
      // Silently handle — buyer may not have a deal yet
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadStatus()
  }, [loadStatus])

  const handleSubmit = async () => {
    setSubmitting(true)
    try {
      const actionBody: Record<string, unknown> = { action: selectedPath }

      if (selectedPath === "upload") {
        const fileInput = document.getElementById("insuranceFile") as HTMLInputElement
        const file = fileInput?.files?.[0]

        if (!file) {
          toast({ variant: "destructive", title: "File required", description: "Please select a file to upload." })
          setSubmitting(false)
          return
        }

        actionBody.documentType = documentType
        actionBody.fileName = file.name
        actionBody.mimeType = file.type
        actionBody.fileSize = file.size
      }

      const response = await fetch("/api/buyer/insurance", {
        method: "POST",
        headers: { ...csrfHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(actionBody),
      })

      const data = await response.json()

      if (!data.success) {
        throw new Error(data.error || "Insurance action failed")
      }

      setCompleted(true)
      const messages: Record<InsurancePath, { title: string; description: string }> = {
        upload: { title: "Insurance uploaded!", description: "Your proof of insurance has been submitted for review." },
        pending: { title: "Acknowledged", description: "You've acknowledged that insurance is required before delivery." },
        help: { title: "Help requested", description: "Our team will contact you to help with insurance coverage." },
      }
      toast(messages[selectedPath])

      // Reload status to reflect the new state
      await loadStatus()
    } catch (error: unknown) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to process insurance action",
      })
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <ProtectedRoute allowedRoles={["BUYER"]}>
        <div className="space-y-6 max-w-3xl mx-auto p-4">
          <Skeleton className="h-9 w-64 mb-2" />
          <Skeleton className="h-5 w-96" />
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
        </div>
      </ProtectedRoute>
    )
  }

  // Already completed or verified
  if (currentStatus === "VERIFIED") {
    return (
      <ProtectedRoute allowedRoles={["BUYER"]}>
        <div className="space-y-6 max-w-3xl mx-auto p-4">
          <h1 className="text-2xl font-bold">Insurance</h1>
          <Card className="border-green-200 bg-green-50/50">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-6 w-6 text-green-600" />
                <div>
                  <p className="font-semibold text-green-900">Insurance Verified</p>
                  <p className="text-sm text-green-700">Your insurance has been verified. You&apos;re all set for delivery.</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Button variant="outline" onClick={() => router.push("/buyer/dashboard")}>
            Back to Dashboard <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </ProtectedRoute>
    )
  }

  // Success confirmation after action
  if (completed) {
    const statusMessages: Record<string, string> = {
      CURRENT_INSURANCE_UPLOADED: "Your insurance proof has been submitted and is pending review.",
      INSURANCE_PENDING: "You've acknowledged that insurance is required before delivery. You can continue shopping.",
      HELP_REQUESTED: "Our team has been notified and will reach out to help you with insurance.",
    }

    return (
      <ProtectedRoute allowedRoles={["BUYER"]}>
        <div className="space-y-6 max-w-3xl mx-auto p-4">
          <h1 className="text-2xl font-bold">Insurance</h1>
          <Card className="border-blue-200 bg-blue-50/50">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-6 w-6 text-blue-600" />
                <div>
                  <p className="font-semibold text-blue-900">Action Completed</p>
                  <p className="text-sm text-blue-700">
                    {currentStatus ? statusMessages[currentStatus] || "Insurance action recorded." : "Insurance action recorded."}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Button variant="outline" onClick={() => router.push("/buyer/dashboard")}>
            Back to Dashboard <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </ProtectedRoute>
    )
  }

  return (
    <ProtectedRoute allowedRoles={["BUYER"]}>
      <div className="space-y-6 max-w-3xl mx-auto p-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mb-1">Insurance</h1>
          <p className="text-muted-foreground text-sm sm:text-base">
            Proof of insurance is required before your vehicle can be released for delivery.
            This does not affect your ability to shop, shortlist, or participate in auctions.
          </p>
        </div>

        {!hasDeal && (
          <Card className="border-blue-200 bg-blue-50/50">
            <CardContent className="pt-6">
              <p className="text-sm text-blue-800">
                <strong>No active deal yet.</strong> Insurance actions become available after you have an active deal.
                You can still browse and complete this step later.
              </p>
            </CardContent>
          </Card>
        )}

        {hasDeal && (
          <>
            {/* Current status indicator */}
            {currentStatus && currentStatus !== "NOT_STARTED" && (
              <Card className="border-amber-200 bg-amber-50/50">
                <CardContent className="pt-6">
                  <p className="text-sm text-amber-800">
                    <strong>Current status:</strong> {currentStatus.replace(/_/g, " ")}
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Three-path selection */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Choose an Option
                </CardTitle>
                <CardDescription>
                  Select how you&apos;d like to handle insurance for your vehicle purchase.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <RadioGroup value={selectedPath} onValueChange={(v) => setSelectedPath(v as InsurancePath)} className="space-y-4">
                  <div className="flex items-start space-x-3 p-3 rounded-lg border hover:bg-accent/50 transition-colors">
                    <RadioGroupItem value="upload" id="path-upload" className="mt-1" />
                    <Label htmlFor="path-upload" className="cursor-pointer flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Upload className="h-4 w-4 text-blue-600" />
                        <span className="font-semibold">Upload Current Insurance</span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Upload proof of your current insurance policy (PDF, PNG, JPG, JPEG).
                      </p>
                    </Label>
                  </div>

                  <div className="flex items-start space-x-3 p-3 rounded-lg border hover:bg-accent/50 transition-colors">
                    <RadioGroupItem value="pending" id="path-pending" className="mt-1" />
                    <Label htmlFor="path-pending" className="cursor-pointer flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Clock className="h-4 w-4 text-amber-600" />
                        <span className="font-semibold">Continue with Insurance Pending</span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Acknowledge that insurance is required before delivery. You can upload proof later.
                      </p>
                    </Label>
                  </div>

                  <div className="flex items-start space-x-3 p-3 rounded-lg border hover:bg-accent/50 transition-colors">
                    <RadioGroupItem value="help" id="path-help" className="mt-1" />
                    <Label htmlFor="path-help" className="cursor-pointer flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <HelpCircle className="h-4 w-4 text-purple-600" />
                        <span className="font-semibold">Request Help with Insurance</span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Our team will reach out to help you find and set up insurance coverage.
                      </p>
                    </Label>
                  </div>
                </RadioGroup>
              </CardContent>
            </Card>

            {/* Upload form (only visible when upload path selected) */}
            {selectedPath === "upload" && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Upload Insurance Proof</CardTitle>
                  <CardDescription>
                    Upload your insurance card, declarations page, or binder document.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="documentType">Document Type</Label>
                    <Select value={documentType} onValueChange={setDocumentType}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DOCUMENT_TYPES.map((dt) => (
                          <SelectItem key={dt.value} value={dt.value}>
                            {dt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="insuranceFile">Insurance Document</Label>
                    <Input
                      id="insuranceFile"
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg"
                      className="mt-1"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Accepted formats: PDF, PNG, JPG, JPEG
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Submit button */}
            <Button
              onClick={handleSubmit}
              disabled={submitting || !hasDeal}
              className="w-full"
              size="lg"
            >
              {submitting ? "Submitting..." : selectedPath === "upload" ? "Upload Insurance" : selectedPath === "pending" ? "Continue with Pending" : "Request Help"}
            </Button>
          </>
        )}
      </div>
    </ProtectedRoute>
  )
}
