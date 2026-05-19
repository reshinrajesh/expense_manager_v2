import frappe

def run():
    try:
        from expense_manager_v2.api.expense import (
            get_expense_types,
            get_modes_of_payment,
            get_cost_centers,
            get_dashboard_data,
            get_current_month_spends
        )
        print("API Imports Successful!")
        print("Expense Types:", get_expense_types())
        print("Modes of Payment:", get_modes_of_payment())
        print("Cost Centers:", get_cost_centers())
        print("Dashboard Data:", get_dashboard_data())
        print("Current Month Spends:", get_current_month_spends())
    except Exception as e:
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    run()
