"""
Assignment notifications: in-app lead_assignment goes only to the assignee.

Covers:
- Single assign creates a HIGH lead_assignment for the assignee
- Assigner does not receive it
- Self-assignment does not notify
- Bulk assign uses the count in title/metadata
- Re-assigning the same agent does not create another notice
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
    return f"97{uuid.uuid4().int % 10**8:08d}"


def notification_types_for_lead(headers, lead_id: str):
    response = requests.get(f"{BASE_URL}/api/notifications", headers=headers, timeout=15)
    assert response.status_code == 200, response.text
    notes = response.json().get("notifications") or []
    return [n for n in notes if n.get("target_id") == lead_id and n.get("type") == "lead_assignment"]


class TestAssignmentNotify:
    def setup_method(self):
        self.admin = login("alex@bidinn.com")
        self.rep = login("emily@bidinn.com")
        self.admin_me = requests.get(f"{BASE_URL}/api/auth/me", headers=self.admin, timeout=15).json()
        self.rep_me = requests.get(f"{BASE_URL}/api/auth/me", headers=self.rep, timeout=15).json()
        self.created = []

    def teardown_method(self):
        for lead_id in getattr(self, "created", []):
            requests.delete(f"{BASE_URL}/api/leads/{lead_id}", headers=self.admin, timeout=15)

    def _create_lead(self, **extra):
        payload = {
            "name": f"ASN_{uuid.uuid4().hex[:8]}",
            "phone": unique_phone(),
            "source": "Website",
            **extra,
        }
        response = requests.post(f"{BASE_URL}/api/leads", json=payload, headers=self.admin, timeout=15)
        assert response.status_code == 201, response.text
        lead = response.json()
        self.created.append(lead["id"])
        return lead

    def test_assign_notifies_assignee_not_assigner(self):
        lead = self._create_lead()
        assigned = requests.post(
            f"{BASE_URL}/api/leads/{lead['id']}/assign",
            json={"assignee_id": self.rep_me["id"]},
            headers=self.admin,
            timeout=15,
        )
        assert assigned.status_code == 200, assigned.text

        for_rep = notification_types_for_lead(self.rep, lead["id"])
        for_admin = notification_types_for_lead(self.admin, lead["id"])
        assert len(for_rep) >= 1, "assignee must get lead_assignment"
        note = for_rep[0]
        assert note["priority"] == "high"
        assert note["title"] == "New lead assigned to you"
        assert "Emily" in (note.get("message") or "") or "assigned" in (note.get("message") or "").lower()
        assert note.get("target_type") == "lead"
        assert note.get("metadata", {}).get("count") == 1
        assert all(n.get("user_id") != self.admin_me["id"] for n in for_admin) or len(for_admin) == 0
        print("PASS: assignment notifies assignee only")

    def test_self_assignment_does_not_notify(self):
        lead = self._create_lead()
        before = notification_types_for_lead(self.admin, lead["id"])
        assigned = requests.post(
            f"{BASE_URL}/api/leads/{lead['id']}/assign",
            json={"assignee_id": self.admin_me["id"]},
            headers=self.admin,
            timeout=15,
        )
        assert assigned.status_code == 200, assigned.text
        after = notification_types_for_lead(self.admin, lead["id"])
        assert len(after) == len(before)
        print("PASS: self-assignment does not create lead_assignment")

    def test_reassign_same_agent_does_not_duplicate(self):
        lead = self._create_lead()
        first = requests.post(
            f"{BASE_URL}/api/leads/{lead['id']}/assign",
            json={"assignee_id": self.rep_me["id"]},
            headers=self.admin,
            timeout=15,
        )
        assert first.status_code == 200
        count_after_first = len(notification_types_for_lead(self.rep, lead["id"]))
        second = requests.post(
            f"{BASE_URL}/api/leads/{lead['id']}/assign",
            json={"assignee_id": self.rep_me["id"]},
            headers=self.admin,
            timeout=15,
        )
        assert second.status_code == 200
        count_after_second = len(notification_types_for_lead(self.rep, lead["id"]))
        assert count_after_second == count_after_first
        print("PASS: re-assigning the same agent does not duplicate the notice")

    def test_create_with_assignee_notifies(self):
        lead = self._create_lead(assigned_to=self.rep_me["id"])
        notes = notification_types_for_lead(self.rep, lead["id"])
        assert len(notes) >= 1
        print("PASS: create-with-assignee notifies the agent")

    def test_bulk_assign_uses_count_in_title(self):
        leads = [self._create_lead(), self._create_lead(), self._create_lead()]
        ids = [item["id"] for item in leads]
        response = requests.post(
            f"{BASE_URL}/api/leads/bulk-assign",
            json={"lead_ids": ids, "assigned_to": self.rep_me["id"]},
            headers=self.admin,
            timeout=15,
        )
        assert response.status_code == 200, response.text

        inbox = requests.get(f"{BASE_URL}/api/notifications", headers=self.rep, timeout=15).json()
        bulk = [
            n
            for n in inbox.get("notifications") or []
            if n.get("type") == "lead_assignment" and n.get("metadata", {}).get("count") == 3
        ]
        assert len(bulk) >= 1, f"expected bulk assignment notice, got {[n.get('title') for n in inbox.get('notifications') or []]}"
        assert bulk[0]["title"] == "3 leads assigned to you"
        assert bulk[0].get("target_type") == "dashboard"
        print("PASS: bulk assign notice uses count")
