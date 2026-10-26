import { query } from "@/lib/db";
import { idSchema } from "@/lib/validation";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const parsed = idSchema.safeParse((await context.params).id);
  if (!parsed.success)
    return Response.json({ error: "Invalid seller ID." }, { status: 400 });
  try {
    const seller = (
      await query(
        "SELECT id,name,created_at FROM users WHERE id=$1 AND role IN ('builder','admin') AND disabled=false",
        [parsed.data],
      )
    ).rows[0];
    if (!seller)
      return Response.json({ error: "Seller not found." }, { status: 404 });
    const products = (
      await query(
        `SELECT p.id,p.name,p.description,p.category,p.technology,p.features,p.screenshots,p.price_cents,p.revision,p.license,p.status,p.audit_status,p.audit_findings,p.review_note,p.reviewed_at,p.sample,p.accent,p.created_at,p.repository,p.seller_id,(p.artifact_key IS NOT NULL) AS download_available,u.name AS seller_name FROM products p JOIN users u ON u.id=p.seller_id WHERE p.seller_id=$1 AND p.status='approved' ORDER BY p.created_at DESC LIMIT 100`,
        [seller.id],
      )
    ).rows;
    return Response.json(
      { seller, products },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "Unable to load seller profile. Please try again." },
      { status: 503 },
    );
  }
}
