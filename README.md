# Expense Manager v2

A custom Frappe / ERPNext app for end-to-end expense claim management, styled with the **Bizaxl Design System**.

---

## Features

| Feature | Description |
|---|---|
| **Expense Claims** | Submittable DocType with line-item child table |
| **Expense Policies** | Per-type budget caps (per claim + per month) |
| **Approval Workflow** | Draft → Pending Approval → Approved / Rejected → Amend |
| **Email Notifications** | Bizaxl-branded HTML emails on submit, approve, reject |
| **Employee SPA** | Full single-page app inside Frappe Desk (`/expense-portal`) |
| **Manager Queue** | Dedicated manager view with bulk approve / reject |
| **Analytics** | Spend-by-category bar chart + 6-month trend |
| **Advanced Filters** | Date range, amount range, status, search on My Claims |
| **Claim Amendment** | One-click amend & resubmit of rejected claims |
| **Print View** | Formatted print / Save-as-PDF for any claim |
| **Bizaxl Theme** | Full Frappe Desk + Website theme (navbar, sidebar, forms, modals) |
| **Expense Summary Report** | Script report aggregating data by employee / month / status |

---

## Tech Stack

- **Framework:** Frappe v14/v15 + ERPNext
- **Frontend:** Vanilla JS SPA (no build step required)
- **Styling:** CSS custom properties — Bizaxl Design System
- **Font:** DM Sans (Google Fonts)

---

## Installation

```bash
# 1. Move / clone into your bench apps folder
cp -r expense_manager_v2 /path/to/frappe-bench/apps/

# 2. Install Python package
pip install -e apps/expense_manager_v2

# 3. Install app on your site
bench --site <your-site> install-app expense_manager_v2

# 4. Run migrations (creates tables, loads fixtures)
bench --site <your-site> migrate

# 5. Build static assets (CSS/JS)
bench build --app expense_manager_v2

# 6. Clear cache and restart
bench --site <your-site> clear-cache
bench restart
```

---

## Post-Install Setup

1. Go to **Frappe Desk → Expense Type** and add your master list (Travel, Meals, Accommodation, etc.)
2. *(Optional)* Go to **Expense Policy** and set per-type spending limits
3. Navigate to **Desk → expense-portal** to open the Employee SPA

---

## Roles

| Role | Access |
|---|---|
| `Expense Employee` | SPA only — sees own claims, can submit & amend |
| `Expense Manager` | Full Desk + Manager Queue — can approve/reject & bulk action |
| `System Manager` | Full access everywhere |

---

## Bizaxl Design System Tokens

| Token | Hex | Usage |
|---|---|---|
| `navy-dark` | `#05133C` | Navbar, sidebar, headings |
| `navy-base` | `#091526` | Deep backgrounds (dark mode) |
| `mint-green` | `#14F1B1` | Primary buttons, active states |
| `bright-blue` | `#114EFF` | Links, accents |
| `gray-100` | `#F4F4F5` | Subtle backgrounds, borders |
| `gray-400` | `#71717B` | Secondary text |

---

## App Structure

```
expense_manager_v2/
├── expense_manager_v2/
│   ├── hooks.py                    ← App config, CSS injection
│   ├── notifications.py            ← Desk bell-icon count
│   ├── api/
│   │   └── expense.py              ← All @whitelist API endpoints
│   ├── expense_manager_v2/
│   │   ├── doctype/
│   │   │   ├── expense_claim/      ← Core submittable DocType
│   │   │   ├── expense_claim_item/ ← Child table (line items)
│   │   │   ├── expense_type/       ← Master list
│   │   │   └── expense_policy/     ← Budget policy caps
│   │   └── report/
│   │       └── expense_summary/    ← Script report
│   ├── page/
│   │   └── expense_portal/         ← Full Bizaxl SPA
│   ├── public/
│   │   └── css/
│   │       └── bizaxl_theme.css    ← Global Frappe theme
│   ├── workflow/
│   │   └── expense_claim_approval.json
│   └── fixtures/
│       └── website_theme.json
├── setup.py
├── MANIFEST.in
└── requirements.txt
```

---

## License

MIT — © Bizaxl
