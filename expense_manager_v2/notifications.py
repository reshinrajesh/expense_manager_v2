# -*- coding: utf-8 -*-
"""
Notification config for the Frappe bell icon (top-right in Desk).
Expense Managers see a count of claims pending their review.
"""
import frappe


def get_notification_config():
    return {
        "for_doctype": {
            "Expense Claim": {
                "workflow_state": "Pending Approval"
            }
        }
    }
