# -*- coding: utf-8 -*-
from __future__ import unicode_literals

app_name = "expense_manager_v2"
app_title = "Expense Manager"
app_publisher = "Bizaxl"
app_description = "Custom Expense Management App built on top of ERPNext"
app_email = "admin@bizaxl.com"
app_license = "MIT"
app_version = "0.0.1"

# ------------------------------------------------------------------
# App Dependencies
# ------------------------------------------------------------------
required_apps = ["frappe", "erpnext"]

# ------------------------------------------------------------------
# Fixtures — install roles and the workflow on bench migrate
# ------------------------------------------------------------------
fixtures = [
    {
        "dt": "Role",
        "filters": [["role_name", "in", ["Expense Employee", "Expense Manager"]]]
    },
    {
        "dt": "Workflow",
        "filters": [["name", "=", "Expense Claim Approval"]]
    },
    {
        "dt": "Workflow State",
        "filters": [["workflow_state_name", "in", [
            "Draft", "Submitted", "Pending Approval", "Approved", "Rejected"
        ]]]
    },
    {
        "dt": "Workflow Action Master",
        "filters": [["name", "in", ["Submit", "Approve", "Reject", "Resubmit"]]]
    },
    {
        "dt": "Website Theme",
        "filters": [["name", "=", "Bizaxl"]]
    },
]

# ------------------------------------------------------------------
# DocType Events — email notifications fired by the controller
# ------------------------------------------------------------------
doc_events = {
    "Expense Claim": {
        "on_submit":             "expense_manager_v2.expense_manager.doctype.expense_claim.expense_claim.on_submit",
        "on_update_after_submit":"expense_manager_v2.expense_manager.doctype.expense_claim.expense_claim.on_update_after_submit",
    }
}

# ------------------------------------------------------------------
# Desk Notifications (Frappe bell icon)
# ------------------------------------------------------------------
notification_config = "expense_manager_v2.notifications.get_notification_config"

# ------------------------------------------------------------------
# Page permission: only Expense Employee + Manager roles see the SPA
# ------------------------------------------------------------------
has_permission = {
    "Expense Claim": "expense_manager_v2.expense_manager.doctype.expense_claim.expense_claim.has_permission"
}

# ------------------------------------------------------------------
# Jinja environments / custom template tags (none required)
# ------------------------------------------------------------------

# ------------------------------------------------------------------
# Boot session — expose current employee to frontend
# ------------------------------------------------------------------
boot_session = "expense_manager_v2.api.expense.boot_session"

# ------------------------------------------------------------------
# Website routes (not used — SPA lives inside Frappe Desk page)
# ------------------------------------------------------------------

# ------------------------------------------------------------------
# CSS / JS assets bundled with bench build
# Bizaxl theme applies to the entire Frappe Desk + Website
# ------------------------------------------------------------------
app_include_css = [
    "/assets/expense_manager_v2/css/bizaxl_theme.css"
]
app_include_js  = []

# ------------------------------------------------------------------
# Website CSS (public pages / login)
# ------------------------------------------------------------------
web_include_css = [
    "/assets/expense_manager_v2/css/bizaxl_theme.css"
]

# ------------------------------------------------------------------
# Standard DocTypes used (from ERPNext) — no override needed
# ------------------------------------------------------------------
# Employee       → hrms (or erpnext)
# Department     → hrms (or erpnext)
# Cost Center    → erpnext
# Mode of Payment→ erpnext
