# -*- coding: utf-8 -*-
"""
Whitelisted API endpoints consumed by the Employee SPA.
All methods require an active Frappe session (cookie / token auth).
"""
import frappe
from frappe import _
from frappe.utils import flt, today


# ------------------------------------------------------------------
# Boot session — attach current employee info to every page load
# ------------------------------------------------------------------
def boot_session(bootinfo):
    user = frappe.session.user
    employee = frappe.db.get_value(
        "Employee",
        {"user_id": user},
        ["name", "employee_name", "department", "image"],
        as_dict=True,
    )
    bootinfo.expense_employee = employee or {}
    bootinfo.expense_roles = frappe.get_roles(user)


# ------------------------------------------------------------------
# Dashboard summary for the logged-in employee
# ------------------------------------------------------------------
@frappe.whitelist()
def get_dashboard_data():
    user = frappe.session.user
    employee = _get_current_employee(user)

    claims = frappe.get_all(
        "Expense Claim",
        filters={"employee": employee},
        fields=["name", "claim_date", "total_claimed_amount", "workflow_state"],
        order_by="claim_date desc",
        limit=20,
    )

    summary = {
        "Draft":           0,
        "Pending Approval": 0,
        "Approved":        0,
        "Rejected":        0,
        "total_amount":    0.0,
    }
    for c in claims:
        state = c.workflow_state or "Draft"
        if state in summary:
            summary[state] += 1
        summary["total_amount"] += flt(c.total_claimed_amount)

    # Calculate MoM comparison
    from frappe.utils import today, add_months, add_days
    curr_month_start = today()[:8] + "01"
    prev_month_start = add_months(curr_month_start, -1)[:8] + "01"
    prev_month_end = add_days(curr_month_start, -1)

    curr_month_spend = frappe.db.get_value(
        "Expense Claim",
        {
            "employee": employee,
            "claim_date": (">=", curr_month_start),
            "workflow_state": ("in", ["Approved", "Pending Approval"])
        },
        "SUM(total_claimed_amount)"
    ) or 0.0

    prev_month_spend = frappe.db.get_value(
        "Expense Claim",
        {
            "employee": employee,
            "claim_date": ["between", [prev_month_start, prev_month_end]],
            "workflow_state": ("in", ["Approved", "Pending Approval"])
        },
        "SUM(total_claimed_amount)"
    ) or 0.0

    if prev_month_spend > 0:
        mom_percent = round(((curr_month_spend - prev_month_spend) / prev_month_spend) * 100, 1)
    else:
        mom_percent = 100.0 if curr_month_spend > 0 else 0.0

    return {
        "summary": summary,
        "recent_claims": claims,
        "mom_percent": mom_percent,
        "curr_month_spend": flt(curr_month_spend),
        "prev_month_spend": flt(prev_month_spend)
    }


# ------------------------------------------------------------------
# Full list of the employee's own claims with optional status filter
# ------------------------------------------------------------------
@frappe.whitelist()
def get_my_claims(status=None):
    user = frappe.session.user
    employee = _get_current_employee(user)

    filters = {"employee": employee}
    if status and status != "All":
        filters["workflow_state"] = status

    claims = frappe.get_all(
        "Expense Claim",
        filters=filters,
        fields=[
            "name", "claim_date", "total_claimed_amount",
            "workflow_state", "department", "remarks",
        ],
        order_by="claim_date desc",
    )
    return claims


# ------------------------------------------------------------------
# Single claim detail (with child items)
# ------------------------------------------------------------------
@frappe.whitelist()
def get_claim_detail(claim_name):
    doc = frappe.get_doc("Expense Claim", claim_name)

    # Enforce row-level access
    from expense_manager_v2.expense_manager.doctype.expense_claim.expense_claim import has_permission
    if not has_permission(doc):
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    return doc.as_dict()


# ------------------------------------------------------------------
# Create a new expense claim (Draft)
# ------------------------------------------------------------------
@frappe.whitelist()
def create_expense_claim(data):
    import json
    if isinstance(data, str):
        data = json.loads(data)

    user     = frappe.session.user
    employee = _get_current_employee(user)
    if not employee:
        frappe.throw(_("No Employee record linked to your user account."))

    doc = frappe.new_doc("Expense Claim")
    doc.employee   = employee
    doc.claim_date = data.get("claim_date") or today()
    doc.cost_center = data.get("cost_center")

    for item in data.get("expenses", []):
        doc.append("expenses", {
            "expense_type":    item.get("expense_type"),
            "description":     item.get("description"),
            "amount":          flt(item.get("amount", 0)),
            "mode_of_payment": item.get("mode_of_payment"),
            "receipt":         item.get("receipt"),
        })

    doc.insert(ignore_permissions=False)
    return {"name": doc.name, "message": "Expense Claim created successfully."}


# ------------------------------------------------------------------
@frappe.whitelist()
def submit_expense_claim(claim_name):
    doc = frappe.get_doc("Expense Claim", claim_name)
    _assert_own_claim(doc)
    doc.submit()
    return {"message": f"{claim_name} submitted for approval."}


# ------------------------------------------------------------------
# Decline a draft expense claim (delete draft document)
# ------------------------------------------------------------------
@frappe.whitelist()
def decline_draft_claim(claim_name):
    doc = frappe.get_doc("Expense Claim", claim_name)
    _assert_own_claim(doc)
    if doc.workflow_state != "Draft":
        frappe.throw(_("Only Draft claims can be declined."))
    frappe.delete_doc("Expense Claim", claim_name, ignore_permissions=True)
    return {"message": f"{claim_name} declined and deleted successfully."}



# ------------------------------------------------------------------
# Manager: Approve a claim
# ------------------------------------------------------------------
@frappe.whitelist()
def approve_claim(claim_name, remarks=None):
    _assert_manager_role()
    doc = frappe.get_doc("Expense Claim", claim_name)
    doc.workflow_state = "Approved"
    doc.remarks = remarks or ""
    doc.save(ignore_permissions=True)
    frappe.db.commit()
    return {"message": f"{claim_name} approved."}


# ------------------------------------------------------------------
# Manager: Reject a claim
# ------------------------------------------------------------------
@frappe.whitelist()
def reject_claim(claim_name, remarks):
    _assert_manager_role()
    if not remarks:
        frappe.throw(_("Remarks are required when rejecting a claim."))
    doc = frappe.get_doc("Expense Claim", claim_name)
    doc.workflow_state = "Rejected"
    doc.remarks = remarks
    doc.save(ignore_permissions=True)
    frappe.db.commit()
    return {"message": f"{claim_name} rejected."}


# ------------------------------------------------------------------
# Drop-down helpers for the SPA form
# ------------------------------------------------------------------
@frappe.whitelist()
def get_expense_types():
    return frappe.get_all(
        "Expense Type",
        filters={"is_active": 1},
        fields=["name", "expense_type_name"],
        order_by="expense_type_name asc",
    )


@frappe.whitelist()
def get_modes_of_payment():
    return frappe.get_all(
        "Mode of Payment",
        fields=["name"],
        order_by="name asc",
    )


@frappe.whitelist()
def get_cost_centers():
    return frappe.get_all(
        "Cost Center",
        filters={"is_group": 0},
        fields=["name", "cost_center_name"],
        order_by="cost_center_name asc",
    )


# ------------------------------------------------------------------
# Internal helpers
# ------------------------------------------------------------------
def _get_current_employee(user):
    return frappe.db.get_value("Employee", {"user_id": user}, "name")


def _assert_own_claim(doc):
    user     = frappe.session.user
    employee = _get_current_employee(user)
    if doc.employee != employee:
        frappe.throw(_("You can only act on your own claims."), frappe.PermissionError)


def _assert_manager_role():
    if "Expense Manager" not in frappe.get_roles() and \
       "System Manager" not in frappe.get_roles():
        frappe.throw(_("Only Expense Managers can perform this action."), frappe.PermissionError)


# ------------------------------------------------------------------
# NEW: Manager queue — all claims with search/filter
# ------------------------------------------------------------------
@frappe.whitelist()
def get_manager_queue(status="Pending Approval", search=None, from_date=None, to_date=None):
    _assert_manager_role()
    conditions = []
    values = {}
    if status and status != "All":
        conditions.append("ec.workflow_state = %(status)s")
        values["status"] = status
    if from_date:
        conditions.append("ec.claim_date >= %(from_date)s")
        values["from_date"] = from_date
    if to_date:
        conditions.append("ec.claim_date <= %(to_date)s")
        values["to_date"] = to_date
    if search:
        conditions.append("(ec.name LIKE %(search)s OR ec.employee_name LIKE %(search)s)")
        values["search"] = f"%{search}%"
    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
    return frappe.db.sql(f"""
        SELECT ec.name, ec.employee, ec.employee_name, ec.department,
               ec.claim_date, ec.total_claimed_amount, ec.workflow_state, ec.remarks
        FROM `tabExpense Claim` ec
        {where}
        ORDER BY ec.claim_date DESC LIMIT 200
    """, values, as_dict=True)


# ------------------------------------------------------------------
# NEW: Bulk approve or reject a list of claims
# ------------------------------------------------------------------
@frappe.whitelist()
def bulk_action_claims(claim_names, action, remarks=None):
    import json
    _assert_manager_role()
    if isinstance(claim_names, str):
        claim_names = json.loads(claim_names)
    if action not in ("approve", "reject"):
        frappe.throw(_("Invalid action. Use 'approve' or 'reject'."))
    if action == "reject" and not remarks:
        frappe.throw(_("Remarks are required for bulk rejection."))
    results = {"success": [], "failed": []}
    for name in claim_names:
        try:
            doc = frappe.get_doc("Expense Claim", name)
            doc.workflow_state = "Approved" if action == "approve" else "Rejected"
            if remarks:
                doc.remarks = remarks
            doc.save(ignore_permissions=True)
            results["success"].append(name)
        except Exception as e:
            results["failed"].append({"name": name, "error": str(e)})
    frappe.db.commit()
    return results


# ------------------------------------------------------------------
# NEW: Amend a rejected claim — creates fresh draft copy
# ------------------------------------------------------------------
@frappe.whitelist()
def amend_claim(claim_name):
    user     = frappe.session.user
    employee = _get_current_employee(user)
    original = frappe.get_doc("Expense Claim", claim_name)
    if original.employee != employee:
        frappe.throw(_("You can only amend your own claims."), frappe.PermissionError)
    if original.workflow_state != "Rejected":
        frappe.throw(_("Only Rejected claims can be amended."))
    new_doc = frappe.new_doc("Expense Claim")
    new_doc.employee    = original.employee
    new_doc.claim_date  = original.claim_date
    new_doc.cost_center = original.cost_center
    for item in original.expenses:
        new_doc.append("expenses", {
            "expense_type":    item.expense_type,
            "description":     item.description,
            "amount":          item.amount,
            "mode_of_payment": item.mode_of_payment,
            "receipt":         item.receipt,
        })
    new_doc.insert(ignore_permissions=False)
    return {"name": new_doc.name, "message": f"Amendment of {claim_name} created as draft."}


# ------------------------------------------------------------------
# NEW: Analytics — spend by category + 6-month trend + policies
# ------------------------------------------------------------------
@frappe.whitelist()
def get_analytics_data():
    user       = frappe.session.user
    employee   = _get_current_employee(user)
    is_manager = ("Expense Manager" in frappe.get_roles(user) or
                  "System Manager"  in frappe.get_roles(user))
    emp_filter = "" if is_manager else f"AND ec.employee = '{frappe.db.escape(employee or '')}'"

    by_type = frappe.db.sql(f"""
        SELECT eci.expense_type, SUM(eci.amount) AS total
        FROM `tabExpense Claim Item` eci
        JOIN `tabExpense Claim` ec ON ec.name = eci.parent
        WHERE ec.workflow_state IN ('Approved','Pending Approval') {emp_filter}
        GROUP BY eci.expense_type ORDER BY total DESC LIMIT 8
    """, as_dict=True)

    monthly = frappe.db.sql(f"""
        SELECT DATE_FORMAT(ec.claim_date,'%b %Y') AS month_label,
               DATE_FORMAT(ec.claim_date,'%Y-%m') AS month_sort,
               SUM(ec.total_claimed_amount)          AS total
        FROM `tabExpense Claim` ec
        WHERE ec.claim_date >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
          AND ec.workflow_state IN ('Approved','Pending Approval','Rejected') {emp_filter}
        GROUP BY month_sort, month_label ORDER BY month_sort ASC
    """, as_dict=True)

    policies = frappe.get_all(
        "Expense Policy",
        filters={"is_active": 1},
        fields=["expense_type", "max_amount_per_claim", "max_amount_per_month"],
        order_by="expense_type asc",
    )
    return {"by_type": by_type, "monthly": monthly, "policies": policies}


# ------------------------------------------------------------------
# NEW: Advanced filtered claim list (date + amount + search)
# ------------------------------------------------------------------
@frappe.whitelist()
def get_my_claims_filtered(status=None, from_date=None, to_date=None,
                            min_amount=None, max_amount=None, search=None):
    user     = frappe.session.user
    employee = _get_current_employee(user)
    conditions = ["ec.employee = %(employee)s"]
    values     = {"employee": employee}
    if status and status != "All":
        conditions.append("ec.workflow_state = %(status)s")
        values["status"] = status
    if from_date:
        conditions.append("ec.claim_date >= %(from_date)s")
        values["from_date"] = from_date
    if to_date:
        conditions.append("ec.claim_date <= %(to_date)s")
        values["to_date"] = to_date
    if min_amount:
        conditions.append("ec.total_claimed_amount >= %(min_amount)s")
        values["min_amount"] = flt(min_amount)
    if max_amount:
        conditions.append("ec.total_claimed_amount <= %(max_amount)s")
        values["max_amount"] = flt(max_amount)
    if search:
        conditions.append("ec.name LIKE %(search)s")
        values["search"] = f"%{search}%"
    where = "WHERE " + " AND ".join(conditions)
    return frappe.db.sql(f"""
        SELECT ec.name, ec.claim_date, ec.department,
               ec.total_claimed_amount, ec.workflow_state, ec.remarks
        FROM `tabExpense Claim` ec {where}
        ORDER BY ec.claim_date DESC
    """, values, as_dict=True)


# ------------------------------------------------------------------
# NEW: Get current employee's spent totals for current calendar month
# ------------------------------------------------------------------
@frappe.whitelist()
def get_current_month_spends():
    user = frappe.session.user
    employee = _get_current_employee(user)
    if not employee:
        return {}
    from frappe.utils import today, flt
    start_date = today()[:8] + "01"
    
    spends = frappe.db.sql("""
        SELECT eci.expense_type, SUM(eci.amount) AS total
        FROM `tabExpense Claim Item` eci
        JOIN `tabExpense Claim` ec ON ec.name = eci.parent
        WHERE ec.employee = %s 
          AND ec.claim_date >= %s
          AND ec.workflow_state IN ('Approved','Pending Approval')
        GROUP BY eci.expense_type
    """, (employee, start_date), as_dict=True)
    
    return {r.expense_type: flt(r.total) for r in spends}
