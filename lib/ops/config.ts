import { z } from "zod"
import opsJson from "@/data/ops.json"
import { QueueName } from "@/lib/schemas"

/** Illustrative operations settings: service levels, the fictional team, delegated authority, cost inputs. */
const Role = z.enum(["analyst", "lead", "branch_manager", "credit_committee"])

export const OpsConfig = z.object({
  version: z.number().int().positive(),
  businessHours: z.object({ start: z.number().int().min(0).max(23), end: z.number().int().min(1).max(24) }),
  queues: z.record(QueueName, z.object({ label: z.string(), slaBusinessHours: z.number().positive(), minutesPerItem: z.number().int().positive(), skill: QueueName })),
  team: z.array(z.object({ id: z.string().regex(/^usr_[a-z0-9_-]+$/), name: z.string(), role: Role, skills: z.array(QueueName), capacity: z.number().int().positive() })),
  authority: z.object({
    analyst: z.object({ tierId: z.string(), limitCents: z.number().int().positive() }),
    lead: z.object({ tierId: z.string(), limitCents: z.number().int().positive() }),
    branch_manager: z.object({ tierId: z.string(), limitCents: z.number().int().positive() }),
    credit_committee: z.object({ tierId: z.string(), limitCents: z.null() }),
  }),
  cost: z.object({ loadedHourlyCostCents: z.number().int().positive() }),
})

export type OpsConfig = z.infer<typeof OpsConfig>
export type Role = z.infer<typeof Role>
export type TeamMember = OpsConfig["team"][number]
export const OPS: OpsConfig = OpsConfig.parse(opsJson)

/** Roles from least to most authority. */
export const ROLE_ORDER: Role[] = ["analyst", "lead", "branch_manager", "credit_committee"]
export const member = (id: string) => OPS.team.find((t) => t.id === id)
