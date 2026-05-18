# -*- coding: utf-8 -*-
"""
Expense Claim controller.

Business logic:
  - _check_policy_limits()  : validates each line item against Expense Policy caps
  - validate()              : auto-sum line items, fetch employee details
  - on_submit()             : email all Expense Managers
  - on_update_after_submit(): email employee on Approved / Rejected state change
  - has_permission()        : Expense Employee sees only their own claims
"""
import frappe
from frappe.model.document import Document
from frappe.utils import flt, get_url_to_form, nowdate


class ExpenseClaim(Document):
    # ------------------------------------------------------------------
    # validate — runs on Save (Draft) and before Submit
    # ------------------------------------------------------------------
    def validate(self):
        self._fetch_employee_details()
        self._compute_total()
        self._check_policy_limits()

    def _fetch_employee_details(self):
        if self.employee:
            emp = frappe.get_doc("Employee", self.employee)
            self.employee_name = emp.employee_name
            if not self.department:
                self.department = emp.department

    def _compute_total(self):
        total = sum(flt(row.amount) for row in (self.expenses or []))
        self.total_claimed_amount = total

    def _check_policy_limits(self):
        """Validate each line item against active Expense Policy caps."""
        if not self.expenses:
            return
        policies = {}
        for row in self.expenses:
            if not row.expense_type:
                continue
            if row.expense_type not in policies:
                pol = frappe.db.get_value(
                    "Expense Policy",
                    {"expense_type": row.expense_type, "is_active": 1},
                    ["max_amount_per_claim", "max_amount_per_month"],
                    as_dict=True,
                )
                policies[row.expense_type] = pol

            pol = policies.get(row.expense_type)
            if not pol:
                continue

            # Per-claim line item cap
            if pol.max_amount_per_claim and flt(row.amount) > flt(pol.max_amount_per_claim):
                frappe.throw(
                    f"Line item '{row.expense_type}' amount ₹{flt(row.amount):,.2f} "
                    f"exceeds the policy limit of ₹{flt(pol.max_amount_per_claim):,.2f} per claim."
                )

            # Monthly cap (skip for draft saves; enforced on submit)
            if pol.max_amount_per_month and flt(pol.max_amount_per_month) > 0 \
                    and self.workflow_state not in (None, "Draft", ""):
                month_start = frappe.utils.get_first_day(self.claim_date)
                month_end   = frappe.utils.get_last_day(self.claim_date)
                existing = frappe.db.sql("""
                    SELECT COALESCE(SUM(eci.amount), 0)
                    FROM `tabExpense Claim Item` eci
                    JOIN `tabExpense Claim` ec ON ec.name = eci.parent
                    WHERE eci.expense_type = %s
                      AND ec.employee      = %s
                      AND ec.claim_date   BETWEEN %s AND %s
                      AND ec.workflow_state IN ('Pending Approval','Approved')
                      AND ec.name != %s
                """, (row.expense_type, self.employee,
                       month_start, month_end, self.name or ''))[0][0]
                total_for_month = flt(existing) + flt(row.amount)
                if total_for_month > flt(pol.max_amount_per_month):
                    frappe.throw(
                        f"'{row.expense_type}' monthly cap of "
                        f"₹{flt(pol.max_amount_per_month):,.2f} would be exceeded. "
                        f"You have already claimed ₹{flt(existing):,.2f} this month."
                    )

    # ------------------------------------------------------------------
    # on_submit — notify all users with 'Expense Manager' role
    # ------------------------------------------------------------------
    def on_submit(self):
        self.workflow_state = "Pending Approval"
        self._notify_managers()

    def _notify_managers(self):
        managers = frappe.get_all(
            "Has Role",
            filters={"role": "Expense Manager", "parenttype": "User"},
            fields=["parent as user"],
        )
        if not managers:
            return

        desk_url = get_url_to_form("Expense Claim", self.name)
        subject = f"[Expense Claim] {self.employee_name} — {self.name} submitted for approval"

        rows_html = "".join(
            f"<tr><td>{r.expense_type}</td><td>{r.description or ''}</td>"
            f"<td style='text-align:right'>{flt(r.amount):,.2f}</td></tr>"
            for r in (self.expenses or [])
        )

        message = f"""
        <div style="font-family:'DM Sans',Arial,sans-serif;max-width:600px;">
          <div style="background:#05133C;padding:20px 24px;border-radius:12px 12px 0 0;">
            <h2 style="color:#14F1B1;margin:0;font-size:20px;">Expense Claim Submitted</h2>
          </div>
          <div style="background:#fff;border:1px solid #F4F4F5;padding:24px;border-radius:0 0 12px 12px;">
            <p style="color:#71717B;font-size:14px;margin-bottom:16px;">
              A new expense claim requires your review.
            </p>
            <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:16px;">
              <tr>
                <td style="padding:8px 0;color:#71717B;">Employee</td>
                <td style="padding:8px 0;font-weight:600;color:#05133C;">{self.employee_name}</td>
              </tr>
              <tr>
                <td style="padding:8px 0;color:#71717B;">Department</td>
                <td style="padding:8px 0;color:#05133C;">{self.department or '—'}</td>
              </tr>
              <tr>
                <td style="padding:8px 0;color:#71717B;">Claim Date</td>
                <td style="padding:8px 0;color:#05133C;">{self.claim_date}</td>
              </tr>
              <tr>
                <td style="padding:8px 0;color:#71717B;">Total Amount</td>
                <td style="padding:8px 0;font-weight:700;color:#05133C;">{flt(self.total_claimed_amount):,.2f}</td>
              </tr>
            </table>
            <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:20px;">
              <thead>
                <tr style="background:#F4F4F5;">
                  <th style="padding:8px;text-align:left;color:#05133C;">Type</th>
                  <th style="padding:8px;text-align:left;color:#05133C;">Description</th>
                  <th style="padding:8px;text-align:right;color:#05133C;">Amount</th>
                </tr>
              </thead>
              <tbody>{rows_html}</tbody>
            </table>
            <a href="{desk_url}"
               style="display:inline-block;background:#14F1B1;color:#05133C;
                      font-weight:700;padding:10px 24px;border-radius:10px;
                      text-decoration:none;font-size:14px;">
              Review in Frappe Desk →
            </a>
          </div>
        </div>
        """

        for m in managers:
            try:
                frappe.sendmail(
                    recipients=[m.user],
                    subject=subject,
                    message=message,
                )
            except Exception:
                frappe.log_error(frappe.get_traceback(), "Expense Claim — manager email failed")

    # ------------------------------------------------------------------
    # on_update_after_submit — notify employee when state changes
    # ------------------------------------------------------------------
    def on_update_after_submit(self):
        if self.workflow_state in ("Approved", "Rejected"):
            self._notify_employee()

    def _notify_employee(self):
        user_email = frappe.db.get_value("Employee", self.employee, "user_id")
        if not user_email:
            return

        desk_url = get_url_to_form("Expense Claim", self.name)
        state_color = "#14F1B1" if self.workflow_state == "Approved" else "#EF4444"
        state_label = self.workflow_state.upper()

        subject = f"[Expense Claim] {self.name} — {self.workflow_state}"
        message = f"""
        <div style="font-family:'DM Sans',Arial,sans-serif;max-width:600px;">
          <div style="background:#05133C;padding:20px 24px;border-radius:12px 12px 0 0;">
            <h2 style="color:{state_color};margin:0;font-size:20px;">
              Claim {state_label}
            </h2>
          </div>
          <div style="background:#fff;border:1px solid #F4F4F5;padding:24px;border-radius:0 0 12px 12px;">
            <p style="color:#71717B;font-size:14px;">Your expense claim <strong>{self.name}</strong>
              (Total: <strong>{flt(self.total_claimed_amount):,.2f}</strong>) has been
              <strong style="color:{state_color};">{self.workflow_state}</strong>.
            </p>
            {"<div style='background:#FEF2F2;border-left:4px solid #EF4444;padding:12px 16px;border-radius:4px;margin-top:16px;'>"
              + f"<p style='margin:0;font-size:13px;color:#7F1D1D;'><strong>Manager Remarks:</strong><br>{self.remarks or '—'}</p></div>"
              if self.workflow_state == "Rejected" else ""}
            {"<p style='color:#71717B;font-size:13px;margin-top:12px;'>You may edit and resubmit the claim from your portal.</p>"
              if self.workflow_state == "Rejected" else ""}
            <a href="{desk_url}"
               style="display:inline-block;background:#05133C;color:#fff;
                      font-weight:700;padding:10px 24px;border-radius:10px;
                      text-decoration:none;font-size:14px;margin-top:20px;">
              View Claim →
            </a>
          </div>
        </div>
        """
        try:
            frappe.sendmail(recipients=[user_email], subject=subject, message=message)
        except Exception:
            frappe.log_error(frappe.get_traceback(), "Expense Claim — employee email failed")


# ------------------------------------------------------------------
# Row-level permission — Expense Employees see only their own claims
# ------------------------------------------------------------------
def has_permission(doc, ptype="read", user=None):
    if not user:
        user = frappe.session.user

    if frappe.db.exists("Has Role", {"parent": user, "role": "System Manager"}):
        return True
    if frappe.db.exists("Has Role", {"parent": user, "role": "Expense Manager"}):
        return True

    # Expense Employee: only their linked employee record
    employee = frappe.db.get_value("Employee", {"user_id": user}, "name")
    if employee and doc.employee == employee:
        return True

    return False


# ------------------------------------------------------------------
# Email hooks called from hooks.py doc_events
# ------------------------------------------------------------------
def on_submit(doc, method):
    doc.on_submit()


def on_update_after_submit(doc, method):
    doc.on_update_after_submit()
