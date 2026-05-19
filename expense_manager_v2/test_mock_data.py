import frappe
from frappe.utils import today, add_months, add_days

def run():
    create_mock_data()

def create_mock_data():
    print("Populating high-fidelity mock data...")
    
    # 1. Ensure Employee exists for Administrator
    employee_name = "Emp-Admin"
    if not frappe.db.exists("Employee", {"user_id": "Administrator"}):
        emp = frappe.get_doc({
            "doctype": "Employee",
            "employee_name": "Administrator",
            "first_name": "Administrator",
            "date_of_birth": "1990-01-01",
            "user_id": "Administrator",
            "gender": "Male",
            "status": "Active",
            "date_of_joining": "2020-01-01"
        })
        emp.insert(ignore_permissions=True)
        employee_id = emp.name
        print(f"Created Employee: {employee_id} for Administrator")
    else:
        employee_id = frappe.db.get_value("Employee", {"user_id": "Administrator"}, "name")
        print(f"Using existing Employee: {employee_id}")

    # 2. Ensure Expense Types exist
    types = [
        {"name": "Travel", "expense_type_name": "Travel", "is_active": 1},
        {"name": "Meals", "expense_type_name": "Meals", "is_active": 1},
        {"name": "Equipment", "expense_type_name": "Equipment", "is_active": 1},
        {"name": "Marketing", "expense_type_name": "Marketing", "is_active": 1},
    ]
    for t in types:
        if not frappe.db.exists("Expense Type", t["name"]):
            doc = frappe.new_doc("Expense Type")
            doc.update(t)
            doc.insert(ignore_permissions=True)
            print(f"Created Expense Type: {t['name']}")

    # 3. Ensure Expense Policies exist
    policies = [
        {"expense_type": "Travel", "max_amount_per_claim": 15000, "max_amount_per_month": 50000, "is_active": 1},
        {"expense_type": "Meals", "max_amount_per_claim": 2000, "max_amount_per_month": 10000, "is_active": 1},
        {"expense_type": "Equipment", "max_amount_per_claim": 50000, "max_amount_per_month": 100000, "is_active": 1},
    ]
    for p in policies:
        if not frappe.db.exists("Expense Policy", {"expense_type": p["expense_type"]}):
            doc = frappe.new_doc("Expense Policy")
            doc.update(p)
            doc.insert(ignore_permissions=True)
            print(f"Created Expense Policy for: {p['expense_type']}")

    # 4. Clear existing claims to avoid duplicates and have clean trends
    frappe.db.sql("DELETE FROM `tabExpense Claim Item`")
    frappe.db.sql("DELETE FROM `tabExpense Claim`")
    print("Cleared existing claims.")

    # 5. Create Mock Claims spanning the last 5 months
    # Spanning Jan, Feb, Mar, Apr, May 2026
    claims_data = [
        {
            "claim_date": "2026-01-15",
            "workflow_state": "Approved",
            "expenses": [
                {"expense_type": "Travel", "description": "Client visit flight tickets", "amount": 8500, "mode_of_payment": "Credit Card"},
                {"expense_type": "Meals", "description": "Dinner with client", "amount": 1500, "mode_of_payment": "Cash"}
            ]
        },
        {
            "claim_date": "2026-02-10",
            "workflow_state": "Approved",
            "expenses": [
                {"expense_type": "Equipment", "description": "Dell 27-inch Monitor", "amount": 14200, "mode_of_payment": "UPI"}
            ]
        },
        {
            "claim_date": "2026-03-05",
            "workflow_state": "Approved",
            "expenses": [
                {"expense_type": "Marketing", "description": "Facebook Ad Campaign", "amount": 20000, "mode_of_payment": "Wire Transfer"},
                {"expense_type": "Meals", "description": "Team lunch celebration", "amount": 1800, "mode_of_payment": "Cheque"}
            ]
        },
        {
            "claim_date": "2026-04-18",
            "workflow_state": "Approved",
            "expenses": [
                {"expense_type": "Travel", "description": "Train tickets for onsite training", "amount": 3200, "mode_of_payment": "Cash"},
                {"expense_type": "Equipment", "description": "Logitech Wireless Keyboard & Mouse", "amount": 4800, "mode_of_payment": "UPI"}
            ]
        },
        {
            "claim_date": "2026-05-12",
            "workflow_state": "Pending Approval",
            "expenses": [
                {"expense_type": "Travel", "description": "Cab fare to airport", "amount": 1800, "mode_of_payment": "UPI"},
                {"expense_type": "Meals", "description": "Airport breakfast", "amount": 800, "mode_of_payment": "Credit Card"}
            ]
        }
    ]

    for idx, c in enumerate(claims_data):
        doc = frappe.new_doc("Expense Claim")
        doc.employee = employee_id
        doc.claim_date = c["claim_date"]
        doc.workflow_state = c["workflow_state"]
        
        # calculate total claimed
        total = 0
        for item in c["expenses"]:
            doc.append("expenses", {
                "expense_type": item["expense_type"],
                "description": item["description"],
                "amount": item["amount"],
                "mode_of_payment": item["mode_of_payment"]
            })
            total += item["amount"]
            
        doc.total_claimed_amount = total
        doc.insert(ignore_permissions=True)
        # Force set state in db since standard insert might default to Draft
        frappe.db.set_value("Expense Claim", doc.name, "workflow_state", c["workflow_state"])
        print(f"Created Mock Claim {idx+1}: {doc.name} (Amount: {total}, Date: {c['claim_date']}, State: {c['workflow_state']})")

    frappe.db.commit()
    print("Successfully populated mock data! Refresh the page to see the beautiful analytics pop.")

if __name__ == "__main__":
    create_mock_data()
