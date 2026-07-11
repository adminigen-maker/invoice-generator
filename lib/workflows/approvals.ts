/**
 * Approval engine — kept intentionally separate from RBAC.
 * RBAC says "can this user create X"; approvals say "does this X need
 * someone else to sign off before it can move to the next state".
 *
 * MVP: hardcoded rules in this file. Phase 2 promotes them to
 * `approval_rules` table + admin UI.
 */

export type ApprovalCheck = {
  required: boolean;
  reason?: string;
  requiredRole?: string;
};

type QuotationForApproval = {
  discount_total: number;
  total: number;
};

export function quotationApprovalRules(q: QuotationForApproval): ApprovalCheck {
  const gross = q.total + q.discount_total;
  const discountPct = gross > 0 ? (q.discount_total / gross) * 100 : 0;

  if (discountPct > 15) {
    return {
      required: true,
      reason: `Discount ${discountPct.toFixed(1)}% exceeds 15% threshold`,
      requiredRole: "sales_manager",
    };
  }
  if (q.total > 100_000) {
    return {
      required: true,
      reason: "Order total exceeds AED 100,000",
      requiredRole: "sales_manager",
    };
  }
  return { required: false };
}
