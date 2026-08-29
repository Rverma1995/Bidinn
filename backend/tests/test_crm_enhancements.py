"""
CRM review & enhancements:
1. Dashboard monthly metrics + immediate-attention counts
2. Combinable AND filters + CSV export alias
3. Remaining balance on bookings
4. Sales-rep lead scoping on previously unscoped paths
5. Duplicate create blocked with assigned owner
6. Import skip-dedup rule
7. Campaign performance flags missing cost data
"""
import os
import uuid
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")


def login(email: str, password: str = "password123") -> dict:
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": email, "password": password},
    )
    assert response.status_code == 200, f"Login failed for {email}: {response.text}"
    token = response.json().get("access_token")
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


class TestDashboardMetrics:
    def setup_method(self):
        self.headers = login("alex@bidinn.com")

    def test_stats_include_monthly_and_attention_metrics(self):
        response = requests.get(f"{BASE_URL}/api/dashboard/stats", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        for key in (
            "uncontacted_over_1hr",
            "overdue_followups",
            "needs_immediate_attention",
            "closed_won",
            "closed_lost",
            "monthly_closed_won",
            "monthly_closed_lost",
            "monthly_revenue",
            "reporting_period",
            "upcoming_followups",
        ):
            assert key in data, f"missing {key}"
        assert data["reporting_period"] == "calendar_month"
        assert data["needs_immediate_attention"] == data["uncontacted_over_1hr"] + data["overdue_followups"]
        assert data["upcoming_followups"] >= 0
        print("PASS: Dashboard stats expose monthly close + attention metrics")

    def test_campaign_performance_flags_missing_cost(self):
        response = requests.get(f"{BASE_URL}/api/dashboard/campaign-performance", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert data.get("campaign_cost_available") is False
        assert data.get("roi_available") is False
        assert "campaigns" in data
        print("PASS: Campaign ROI correctly flagged as unavailable")


class TestLeadFiltersAndExport:
    def setup_method(self):
        self.headers = login("michael@bidinn.com")

    def test_combined_and_filters(self):
        response = requests.get(
            f"{BASE_URL}/api/leads?status=new&source=Website&limit=20",
            headers=self.headers,
        )
        assert response.status_code == 200
        payload = response.json()
        leads = payload.get("leads", payload)
        for lead in leads:
            assert lead["status"] == "new"
            assert lead["source"] == "Website"
        print(f"PASS: AND filters returned {len(leads)} matching leads")

    def test_export_alias_returns_csv(self):
        response = requests.get(
            f"{BASE_URL}/api/leads/export?format=csv&status=new",
            headers=self.headers,
        )
        assert response.status_code == 200
        assert "text/csv" in response.headers.get("Content-Type", "")
        content = response.text
        assert "Name,Phone,Email,Source" in content
        print("PASS: GET /leads/export returns CSV")


class TestSalesRepScoping:
    def setup_method(self):
        self.admin = login("alex@bidinn.com")
        self.rep = login("emily@bidinn.com")

    def test_sales_rep_cannot_fetch_unassigned_lead_by_id(self):
        create = requests.post(
            f"{BASE_URL}/api/leads",
            json={
                "name": f"SCOPE_{uuid.uuid4().hex[:8]}",
                "phone": f"+1555{uuid.uuid4().hex[:8]}",
                "source": "Website",
            },
            headers=self.admin,
        )
        assert create.status_code == 201
        lead_id = create.json()["id"]

        fetch = requests.get(f"{BASE_URL}/api/leads/{lead_id}", headers=self.rep)
        assert fetch.status_code == 403, f"Expected 403, got {fetch.status_code}: {fetch.text}"

        update = requests.put(
            f"{BASE_URL}/api/leads/{lead_id}",
            json={"notes": "should not work"},
            headers=self.rep,
        )
        assert update.status_code == 403

        calls = requests.get(f"{BASE_URL}/api/calls/lead/{lead_id}", headers=self.rep)
        assert calls.status_code == 403

        log_call = requests.post(
            f"{BASE_URL}/api/calls",
            json={"lead_id": lead_id, "outcome": "connected"},
            headers=self.rep,
        )
        assert log_call.status_code == 403

        booking = requests.post(
            f"{BASE_URL}/api/bookings",
            json={
                "lead_id": lead_id,
                "hotel_name": "Nope",
                "check_in": "2026-09-01",
                "check_out": "2026-09-02",
                "final_price": 100,
            },
            headers=self.rep,
        )
        assert booking.status_code == 403

        requests.delete(f"{BASE_URL}/api/leads/{lead_id}", headers=self.admin)
        print("PASS: Sales rep blocked from GET/PUT/calls/bookings for another owner's lead")

    def test_sales_rep_stats_are_scoped(self):
        admin_stats = requests.get(f"{BASE_URL}/api/dashboard/stats", headers=self.admin).json()
        rep_stats = requests.get(f"{BASE_URL}/api/dashboard/stats", headers=self.rep).json()
        assert rep_stats["total_leads"] <= admin_stats["total_leads"]
        print("PASS: Sales-rep dashboard counts are not greater than global counts")


class TestDuplicatePrevention:
    def setup_method(self):
        self.headers = login("alex@bidinn.com")

    def test_create_duplicate_phone_includes_owner(self):
        phone = f"97{uuid.uuid4().int % 10**8:08d}"
        first = requests.post(
            f"{BASE_URL}/api/leads",
            json={"name": f"DUP_OWNER_{uuid.uuid4().hex[:6]}", "phone": phone, "source": "Website"},
            headers=self.headers,
        )
        assert first.status_code == 201
        lead = first.json()

        second = requests.post(
            f"{BASE_URL}/api/leads",
            json={"name": "Should Block", "phone": phone, "source": "Referral"},
            headers=self.headers,
        )
        assert second.status_code == 409
        data = second.json()
        assert "duplicates" in data and len(data["duplicates"]) > 0
        assert "assigned_name" in data["duplicates"][0]
        assert "assigned" in data["detail"].lower() or "duplicate" in data["detail"].lower()

        requests.delete(f"{BASE_URL}/api/leads/{lead['id']}", headers=self.headers)
        print("PASS: Duplicate create blocked with owner in 409 payload")


class TestBookingsBalance:
    def setup_method(self):
        self.headers = login("alex@bidinn.com")

    def test_booking_list_includes_remaining_balance(self):
        response = requests.get(f"{BASE_URL}/api/bookings?limit=5", headers=self.headers)
        assert response.status_code == 200
        payload = response.json()
        bookings = payload.get("bookings", payload)
        if not bookings:
            print("SKIP: no bookings to assert remaining_balance")
            return
        booking = bookings[0]
        assert "remaining_balance" in booking
        expected = max(0, float(booking["final_price"]) - float(booking.get("payment_amount") or 0))
        assert abs(float(booking["remaining_balance"]) - expected) < 0.02
        print("PASS: remaining_balance = final_price - payment_amount")

    def test_remaining_balance_unpaid_partial_paid_and_overpay(self):
        phone = f"97{uuid.uuid4().int % 10**8:08d}"
        lead = requests.post(
            f"{BASE_URL}/api/leads",
            json={"name": f"BAL_{phone}", "phone": phone, "source": "Website"},
            headers=self.headers,
        )
        assert lead.status_code == 201, lead.text
        lead_id = lead.json()["id"]

        created = requests.post(
            f"{BASE_URL}/api/bookings",
            json={
                "lead_id": lead_id,
                "hotel_name": "Test Hotel",
                "check_in": "2026-09-01",
                "check_out": "2026-09-05",
                "final_price": 10000,
            },
            headers=self.headers,
        )
        assert created.status_code == 201, created.text
        booking = created.json()
        assert float(booking["remaining_balance"]) == 10000
        booking_id = booking["id"]

        partial = requests.post(
            f"{BASE_URL}/api/payments",
            json={"booking_id": booking_id, "amount": 4000},
            headers=self.headers,
        )
        assert partial.status_code == 201, partial.text
        after_partial = requests.get(f"{BASE_URL}/api/bookings/{booking_id}", headers=self.headers).json()
        assert abs(float(after_partial["remaining_balance"]) - 6000) < 0.02
        assert after_partial["payment_status"] == "partial"

        rest = requests.post(
            f"{BASE_URL}/api/payments",
            json={"booking_id": booking_id, "amount": 6000},
            headers=self.headers,
        )
        assert rest.status_code == 201, rest.text
        paid = requests.get(f"{BASE_URL}/api/bookings/{booking_id}", headers=self.headers).json()
        assert float(paid["remaining_balance"]) == 0
        assert paid["payment_status"] == "paid"

        extra = requests.post(
            f"{BASE_URL}/api/payments",
            json={"booking_id": booking_id, "amount": 500},
            headers=self.headers,
        )
        assert extra.status_code == 201, extra.text
        over = requests.get(f"{BASE_URL}/api/bookings/{booking_id}", headers=self.headers).json()
        assert float(over["remaining_balance"]) == 0

        requests.delete(f"{BASE_URL}/api/bookings/{booking_id}", headers=self.headers)
        requests.delete(f"{BASE_URL}/api/leads/{lead_id}", headers=self.headers)
        print("PASS: remaining_balance unpaid/partial/paid/overpay")


class TestImportSkipDedup:
    def setup_method(self):
        self.headers = login("alex@bidinn.com")

    def test_import_skips_existing_phone_instead_of_creating_duplicate(self):
        phone = f"97{uuid.uuid4().int % 10**8:08d}"
        new_phone = f"96{uuid.uuid4().int % 10**8:08d}"
        first = requests.post(
            f"{BASE_URL}/api/leads",
            json={"name": f"IMP_EXIST_{phone}", "phone": phone, "source": "Website"},
            headers=self.headers,
        )
        assert first.status_code == 201, first.text
        lead_id = first.json()["id"]

        response = requests.post(
            f"{BASE_URL}/api/leads/import",
            headers=self.headers,
            json={
                "leads": [
                    {"name": "Should Skip", "phone": f"+91 {phone}", "source": "Import", "campaign": "SkipCamp"},
                    {"name": f"IMP_NEW_{new_phone}", "phone": new_phone, "source": "Import", "campaign": "SkipCamp"},
                ]
            },
        )
        assert response.status_code == 201, response.text
        data = response.json()
        assert data.get("dedup_rule") == "skip"
        assert data.get("skipped") >= 1
        assert data.get("imported") >= 1

        requests.delete(f"{BASE_URL}/api/leads/{lead_id}", headers=self.headers)
        for created in data.get("leads") or []:
            if created.get("id"):
                requests.delete(f"{BASE_URL}/api/leads/{created['id']}", headers=self.headers)
        print("PASS: import skips existing phones (dedup_rule=skip)")

