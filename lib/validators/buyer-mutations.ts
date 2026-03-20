import { z } from "zod"

/** Schema for POST /api/buyer/auction/select — select an auction offer to create a deal */
export const auctionSelectSchema = z.object({
  auctionId: z.string().min(1, "auctionId is required"),
  offerId: z.string().min(1, "offerId is required"),
  financingOptionId: z.string().optional(),
})

/** Schema for POST /api/buyer/shortlist — add an item to the buyer's shortlist */
export const shortlistAddSchema = z.object({
  inventoryItemId: z.string().min(1, "inventoryItemId is required"),
})

/** Schema for POST /api/buyer/inventory/claim — claim a vehicle listing */
export const inventoryClaimSchema = z.object({
  listing_id: z.string().min(1, "listing_id is required to claim a vehicle"),
})
