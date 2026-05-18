# -*- coding: utf-8 -*-
import frappe


def get_context(context):
    """Inject current session data into the page context."""
    context.no_cache = 1
    user = frappe.session.user

    employee = frappe.db.get_value(
        "Employee",
        {"user_id": user},
        ["name", "employee_name", "department", "image"],
        as_dict=True,
    )
    context.employee    = employee or {}
    context.user_roles  = frappe.get_roles(user)
    context.is_manager  = "Expense Manager" in context.user_roles or \
                          "System Manager"   in context.user_roles
