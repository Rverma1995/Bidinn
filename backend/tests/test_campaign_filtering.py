"""
Campaign list + campaign filter (commit bce3fdc and current AND/IN filter helpers).

Covers:
- GET /api/leads/campaigns unique sorted list
- Sales-rep scoping on the campaigns list
- GET /api/leads?campaign=... (single and comma-separated OR)
- AND combination with status/source
- CSV export honouring campaign filter
"""
import os
import uuid
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")


def login(email: str, password: str = "password123") -> dict:
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": email, "password": password},
        timeout=15,
    )
    assert response.status_code == 200, f"Login failed for {email}: {response.text}"
    token = response.json().get("access_token")
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def unique_phone() -> str:
    return f"98{uuid.uuid4().hex[:8]}"


def extract_leads(payload):
    if isinstance(payload, dict) and "leads" in payload:
        return payload["leads"]
    return payload


class TestCampaignListEndpoint:
    def setup_method(self):
        self.admin = login("alex@bidinn.com")
        self.rep = login("emily@bidinn.com")
        me = requests.get(f"{BASE_URL}/api/auth/me", headers=self.rep, timeout=15).json()
        self.rep_id = me["id"]
        suffix = uuid.uuid4().hex[:6]
        self.camp_a = f"CAMP_A_{suffix}"
        self.camp_b = f"CAMP_B_{suffix}"
        self.created = []

        shared = {
            "source": "Website",
        }
        first = requests.post(
            f"{BASE_URL}/api/leads",
            headers=self.admin,
            json={
                **shared,
                "name": f"CampA_{suffix}",
                "phone": unique_phone(),
                "campaign": self.camp_a,
                "assigned_to": self.rep_id,
            },
            timeout=15,
        )
        assert first.status_code == 201, first.text
        self.created.append(first.json()["id"])

        second = requests.post(
            f"{BASE_URL}/api/leads",
            headers=self.admin,
            json={
                **shared,
                "name": f"CampB_{suffix}",
                "phone": unique_phone(),
                "campaign": self.camp_b,
            },
            timeout=15,
        )
        assert second.status_code == 201, second.text
        self.created.append(second.json()["id"])

        # Duplicate campaign name should still appear once
        third = requests.post(
            f"{BASE_URL}/api/leads",
            headers=self.admin,
            json={
                **shared,
                "name": f"CampA2_{suffix}",
                "phone": unique_phone(),
                "campaign": self.camp_a,
            },
            timeout=15,
        )
        assert third.status_code == 201, third.text
        self.created.append(third.json()["id"])

    def teardown_method(self):
        for lead_id in getattr(self, "created", []):
            requests.delete(f"{BASE_URL}/api/leads/{lead_id}", headers=self.admin, timeout=15)

    def test_campaigns_requires_auth(self):
        response = requests.get(f"{BASE_URL}/api/leads/campaigns", timeout=15)
        assert response.status_code in (401, 403)

    def test_campaigns_returns_unique_sorted_names(self):
        response = requests.get(f"{BASE_URL}/api/leads/campaigns", headers=self.admin, timeout=15)
        assert response.status_code == 200, response.text
        campaigns = response.json()
        assert isinstance(campaigns, list)
        assert self.camp_a in campaigns
        assert self.camp_b in campaigns
        assert campaigns.count(self.camp_a) == 1
        named = [c for c in campaigns if c in (self.camp_a, self.camp_b)]
        assert named == sorted(named)
        print("PASS: GET /leads/campaigns returns unique sorted campaign names")

    def test_sales_rep_campaigns_are_scoped_to_assigned_leads(self):
        admin_list = requests.get(f"{BASE_URL}/api/leads/campaigns", headers=self.admin, timeout=15).json()
        rep_list = requests.get(f"{BASE_URL}/api/leads/campaigns", headers=self.rep, timeout=15).json()
        assert self.camp_a in admin_list and self.camp_b in admin_list
        assert self.camp_a in rep_list
        assert self.camp_b not in rep_list
        print("PASS: sales rep campaigns list is scoped to assigned leads")


class TestCampaignLeadFilter:
    def setup_method(self):
        self.admin = login("alex@bidinn.com")
        suffix = uuid.uuid4().hex[:6]
        self.camp = f"FILTER_{suffix}"
        self.other = f"OTHER_{suffix}"
        self.created = []

        dubai = requests.post(
            f"{BASE_URL}/api/leads",
            headers=self.admin,
            json={
                "name": f"Dubai_{suffix}",
                "phone": unique_phone(),
                "source": "Website",
                "campaign": self.camp,
            },
            timeout=15,
        )
        assert dubai.status_code == 201, dubai.text
        self.created.append(dubai.json()["id"])

        other = requests.post(
            f"{BASE_URL}/api/leads",
            headers=self.admin,
            json={
                "name": f"Other_{suffix}",
                "phone": unique_phone(),
                "source": "Referral",
                "campaign": self.other,
            },
            timeout=15,
        )
        assert other.status_code == 201, other.text
        self.created.append(other.json()["id"])

    def teardown_method(self):
        for lead_id in getattr(self, "created", []):
            requests.delete(f"{BASE_URL}/api/leads/{lead_id}", headers=self.admin, timeout=15)

    def test_filter_by_single_campaign(self):
        response = requests.get(
            f"{BASE_URL}/api/leads",
            params={"campaign": self.camp, "limit": 50},
            headers=self.admin,
            timeout=15,
        )
        assert response.status_code == 200, response.text
        leads = extract_leads(response.json())
        assert len(leads) >= 1
        assert all(lead["campaign"] == self.camp for lead in leads)
        ids = {lead["id"] for lead in leads}
        assert self.created[0] in ids
        assert self.created[1] not in ids
        print(f"PASS: campaign filter returned {len(leads)} matching leads")

    def test_campaign_all_does_not_restrict(self):
        response = requests.get(
            f"{BASE_URL}/api/leads",
            params={"campaign": "all", "limit": 50},
            headers=self.admin,
            timeout=15,
        )
        assert response.status_code == 200
        ids = {lead["id"] for lead in extract_leads(response.json())}
        assert self.created[0] in ids
        assert self.created[1] in ids

    def test_comma_separated_campaigns_are_or_within_field(self):
        response = requests.get(
            f"{BASE_URL}/api/leads",
            params={"campaign": f"{self.camp},{self.other}", "limit": 50},
            headers=self.admin,
            timeout=15,
        )
        assert response.status_code == 200
        ids = {lead["id"] for lead in extract_leads(response.json())}
        assert self.created[0] in ids
        assert self.created[1] in ids
        print("PASS: comma-separated campaign values use OR within the field")

    def test_campaign_and_source_filters_combine(self):
        match = requests.get(
            f"{BASE_URL}/api/leads",
            params={"campaign": self.camp, "source": "Website", "limit": 50},
            headers=self.admin,
            timeout=15,
        )
        mismatch = requests.get(
            f"{BASE_URL}/api/leads",
            params={"campaign": self.camp, "source": "Referral", "limit": 50},
            headers=self.admin,
            timeout=15,
        )
        assert match.status_code == 200 and mismatch.status_code == 200
        match_ids = {lead["id"] for lead in extract_leads(match.json())}
        mismatch_ids = {lead["id"] for lead in extract_leads(mismatch.json())}
        assert self.created[0] in match_ids
        assert self.created[0] not in mismatch_ids
        print("PASS: campaign + source filters combine with AND")

    def test_export_csv_respects_campaign_filter(self):
        response = requests.get(
            f"{BASE_URL}/api/leads/export",
            params={"format": "csv", "campaign": self.camp},
            headers=self.admin,
            timeout=30,
        )
        assert response.status_code == 200, response.text
        assert "text/csv" in response.headers.get("Content-Type", "")
        content = response.text
        assert "Campaign" in content.splitlines()[0]
        assert self.camp in content
        assert self.other not in content
        print("PASS: CSV export honours campaign filter")

    def test_export_csv_alias_path(self):
        response = requests.get(
            f"{BASE_URL}/api/leads/export/csv",
            params={"campaign": self.camp},
            headers=self.admin,
            timeout=30,
        )
        assert response.status_code == 200
        assert "text/csv" in response.headers.get("Content-Type", "")
        assert self.camp in response.text
