"""
Saved / custom lead filter views.

Covers:
- JWT-scoped GET/POST/DELETE /api/saved-filters (personal, no sharing)
- Extra keys stripped from filter_json
- Applying a saved filter after the referenced campaign disappears:
  existing GET /leads query still 200s with an empty/adjusted result
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


class TestSavedFiltersCrud:
    def setup_method(self):
        self.admin = login("alex@bidinn.com")
        self.rep = login("emily@bidinn.com")
        self.created = []

    def teardown_method(self):
        for filter_id in getattr(self, "created", []):
            requests.delete(
                f"{BASE_URL}/api/saved-filters/{filter_id}",
                headers=self.admin,
                timeout=15,
            )
            requests.delete(
                f"{BASE_URL}/api/saved-filters/{filter_id}",
                headers=self.rep,
                timeout=15,
            )

    def test_requires_auth(self):
        response = requests.get(f"{BASE_URL}/api/saved-filters", timeout=15)
        assert response.status_code in (401, 403)

    def test_create_list_is_scoped_to_owner(self):
        name = f"Dubai new {uuid.uuid4().hex[:6]}"
        created = requests.post(
            f"{BASE_URL}/api/saved-filters",
            headers=self.admin,
            json={
                "name": name,
                "filter_json": {
                    "status": "new",
                    "campaign": "Dubai Tour",
                    "injected": "should-drop",
                },
            },
            timeout=15,
        )
        assert created.status_code == 201, created.text
        body = created.json()
        self.created.append(body["id"])
        assert body["name"] == name
        assert body["filter_json"]["status"] == "new"
        assert body["filter_json"]["campaign"] == "Dubai Tour"
        assert body["filter_json"].get("source") == "all"
        assert "injected" not in body["filter_json"]

        admin_list = requests.get(f"{BASE_URL}/api/saved-filters", headers=self.admin, timeout=15)
        assert admin_list.status_code == 200
        admin_ids = {row["id"] for row in admin_list.json()}
        assert body["id"] in admin_ids

        rep_list = requests.get(f"{BASE_URL}/api/saved-filters", headers=self.rep, timeout=15)
        assert rep_list.status_code == 200
        rep_ids = {row["id"] for row in rep_list.json()}
        assert body["id"] not in rep_ids
        print("PASS: saved filters are personal to the requesting user")

    def test_blank_name_rejected(self):
        response = requests.post(
            f"{BASE_URL}/api/saved-filters",
            headers=self.admin,
            json={"name": "  ", "filter_json": {"status": "new"}},
            timeout=15,
        )
        assert response.status_code == 400

    def test_other_user_cannot_delete(self):
        created = requests.post(
            f"{BASE_URL}/api/saved-filters",
            headers=self.admin,
            json={"name": f"private {uuid.uuid4().hex[:6]}", "filter_json": {"status": "won"}},
            timeout=15,
        )
        assert created.status_code == 201, created.text
        filter_id = created.json()["id"]
        self.created.append(filter_id)

        denied = requests.delete(
            f"{BASE_URL}/api/saved-filters/{filter_id}",
            headers=self.rep,
            timeout=15,
        )
        assert denied.status_code == 404

        still_there = requests.get(f"{BASE_URL}/api/saved-filters", headers=self.admin, timeout=15)
        assert filter_id in {row["id"] for row in still_there.json()}

    def test_owner_can_delete(self):
        created = requests.post(
            f"{BASE_URL}/api/saved-filters",
            headers=self.admin,
            json={"name": f"tmp {uuid.uuid4().hex[:6]}", "filter_json": {"source": "Website"}},
            timeout=15,
        )
        assert created.status_code == 201, created.text
        filter_id = created.json()["id"]

        deleted = requests.delete(
            f"{BASE_URL}/api/saved-filters/{filter_id}",
            headers=self.admin,
            timeout=15,
        )
        assert deleted.status_code == 200, deleted.text

        remaining = requests.get(f"{BASE_URL}/api/saved-filters", headers=self.admin, timeout=15)
        assert filter_id not in {row["id"] for row in remaining.json()}
        print("PASS: owner DELETE removes the saved filter")


class TestSavedFilterStaleCampaign:
    def setup_method(self):
        self.admin = login("alex@bidinn.com")
        suffix = uuid.uuid4().hex[:6]
        self.campaign = f"RETIRED_{suffix}"
        self.lead_ids = []
        self.filter_ids = []

        lead = requests.post(
            f"{BASE_URL}/api/leads",
            headers=self.admin,
            json={
                "name": f"RetiredCamp_{suffix}",
                "phone": unique_phone(),
                "source": "Website",
                "campaign": self.campaign,
            },
            timeout=15,
        )
        assert lead.status_code == 201, lead.text
        self.lead_ids.append(lead.json()["id"])

        saved = requests.post(
            f"{BASE_URL}/api/saved-filters",
            headers=self.admin,
            json={
                "name": f"Retired view {suffix}",
                "filter_json": {"status": "new", "campaign": self.campaign},
            },
            timeout=15,
        )
        assert saved.status_code == 201, saved.text
        self.filter_ids.append(saved.json()["id"])
        self.filter_json = saved.json()["filter_json"]

        # Campaign value is retired: rewrite the lead so the catalog no longer lists it.
        updated = requests.put(
            f"{BASE_URL}/api/leads/{self.lead_ids[0]}",
            headers=self.admin,
            json={"campaign": f"LIVE_{suffix}"},
            timeout=15,
        )
        assert updated.status_code == 200, updated.text

    def teardown_method(self):
        for filter_id in getattr(self, "filter_ids", []):
            requests.delete(f"{BASE_URL}/api/saved-filters/{filter_id}", headers=self.admin, timeout=15)
        for lead_id in getattr(self, "lead_ids", []):
            requests.delete(f"{BASE_URL}/api/leads/{lead_id}", headers=self.admin, timeout=15)

    def test_saved_filter_still_applies_after_campaign_disappears(self):
        catalog = requests.get(f"{BASE_URL}/api/leads/campaigns", headers=self.admin, timeout=15)
        assert catalog.status_code == 200
        assert self.campaign not in catalog.json()

        stored = requests.get(f"{BASE_URL}/api/saved-filters", headers=self.admin, timeout=15)
        assert stored.status_code == 200
        match = next(row for row in stored.json() if row["id"] == self.filter_ids[0])
        assert match["filter_json"]["campaign"] == self.campaign

        # Same params the Leads page sends after loading the saved view.
        params = {k: v for k, v in self.filter_json.items() if v and v != "all"}
        params["limit"] = 50
        listed = requests.get(
            f"{BASE_URL}/api/leads",
            params=params,
            headers=self.admin,
            timeout=15,
        )
        assert listed.status_code == 200, listed.text
        leads = extract_leads(listed.json())
        ids = {lead["id"] for lead in leads}
        assert self.lead_ids[0] not in ids
        assert all(lead.get("campaign") == self.campaign for lead in leads)
        print("PASS: stale campaign saved filter returns 200 with empty/adjusted results")
