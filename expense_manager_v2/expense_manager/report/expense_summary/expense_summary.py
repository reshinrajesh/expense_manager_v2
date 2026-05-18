# -*- coding: utf-8 -*-
"""
Expense Summary — Script Report
Aggregates expense claims by Employee, by Month, and by Status.
Accessible from Frappe Desk by Expense Manager and System Manager.
"""
import frappe
from frappe.utils import flt


def execute(filters=None):
    filters = filters or {}
    columns = get_columns()
    data = get_data(filters)
    return columns, data


def get_columns():
    return [
        {
            "fieldname": "employee",
            "label": "Employee",
            "fieldtype": "Link",
            "options": "Employee",
            "width": 150,
        },
        {
            "fieldname": "employee_name",
            "label": "Employee Name",
            "fieldtype": "Data",
            "width": 180,
        },
        {
            "fieldname": "department",
            "label": "Department",
            "fieldtype": "Link",
            "options": "Department",
            "width": 150,
        },
        {
            "fieldname": "month_year",
            "label": "Month",
            "fieldtype": "Data",
            "width": 110,
        },
        {
            "fieldname": "workflow_state",
            "label": "Status",
            "fieldtype": "Data",
            "width": 120,
        },
        {
            "fieldname": "claim_count",
            "label": "# Claims",
            "fieldtype": "Int",
            "width": 90,
        },
        {
            "fieldname": "total_amount",
            "label": "Total Amount",
            "fieldtype": "Currency",
            "width": 140,
        },
    ]


def get_data(filters):
    conditions = []
    values = {}

    if filters.get("employee"):
        conditions.append("ec.employee = %(employee)s")
        values["employee"] = filters["employee"]

    if filters.get("workflow_state"):
        conditions.append("ec.workflow_state = %(workflow_state)s")
        values["workflow_state"] = filters["workflow_state"]

    if filters.get("from_date"):
        conditions.append("ec.claim_date >= %(from_date)s")
        values["from_date"] = filters["from_date"]

    if filters.get("to_date"):
        conditions.append("ec.claim_date <= %(to_date)s")
        values["to_date"] = filters["to_date"]

    where_clause = ("WHERE " + " AND ".join(conditions)) if conditions else ""

    sql = f"""
        SELECT
            ec.employee,
            ec.employee_name,
            ec.department,
            DATE_FORMAT(ec.claim_date, '%%b %%Y')  AS month_year,
            ec.workflow_state,
            COUNT(ec.name)                          AS claim_count,
            SUM(ec.total_claimed_amount)            AS total_amount
        FROM
            `tabExpense Claim` ec
        {where_clause}
        GROUP BY
            ec.employee, month_year, ec.workflow_state
        ORDER BY
            ec.claim_date DESC, ec.employee
    """
    return frappe.db.sql(sql, values, as_dict=True)


def get_report_summary(filters=None):
    """Called from SPA dashboard for a quick summary blob."""
    filters = filters or {}
    data = get_data(filters)
    total_claims  = sum(r.claim_count for r in data)
    total_amount  = flt(sum(r.total_amount or 0 for r in data))
    approved      = flt(sum(r.total_amount or 0 for r in data if r.workflow_state == "Approved"))
    pending_count = sum(r.claim_count for r in data if r.workflow_state == "Pending Approval")
    return {
        "total_claims":  total_claims,
        "total_amount":  total_amount,
        "approved":      approved,
        "pending_count": pending_count,
    }
