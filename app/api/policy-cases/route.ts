import { getPolicyCases } from "@/lib/data"

/*
 * Cases for the policy impact preview (cast and planted, transactions left
 * out), fetched by the console only when the Policy tab opens. Built once
 * and cached: the data is synthetic and fixed at build time.
 */

async function cases() {
  "use cache"
  return getPolicyCases()
}

export async function GET() {
  return Response.json(await cases())
}
