# -*- coding: utf-8 -*-
import frappe
from frappe.model.document import Document


class ExpensePolicy(Document):
    def validate(self):
        if not self.max_amount_per_claim or self.max_amount_per_claim <= 0:
            frappe.throw("Max Amount Per Claim must be greater than zero.")
