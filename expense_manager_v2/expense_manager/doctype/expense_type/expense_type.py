# -*- coding: utf-8 -*-
import frappe
from frappe.model.document import Document


class ExpenseType(Document):
    def validate(self):
        if not self.expense_type_name:
            frappe.throw("Expense Type Name is required.")
