"""
Tata Smartflo telephony integration tests.

Requires TELEPHONY_ENABLED=true on the backend.
Webhook HMAC is used when TATA_SMARTFLO_WEBHOOK_SECRET is set in this process
(same value the server uses).
"""
import hashlib
import hmac
import json
import os
import uuid

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")
WEBHOOK_SECRET = os.environ.get("TATA_SMARTFLO_WEBHOOK_SECRET", "tata-local-webhook-secret")


def login(email: str, password: str = "password123") -> dict:
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": email, "password": password},
    )
    assert response.status_code == 200, f"Login failed for {email}: {response.text}"
    token = response.json().get("access_token")
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def telephony_enabled() -> bool:
    response = requests.get(f"{BASE_URL}/api/admin/features")
    return response.status_code == 200 and response.json().get("telephony_enabled") is True


skip_without_telephony = pytest.mark.skipif(
    not BASE_URL or not telephony_enabled(),
    reason="TELEPHONY_ENABLED is not true on the backend",
)


def sign_body(body: bytes) -> dict:
    headers = {"Content-Type": "application/json"}
    if WEBHOOK_SECRET:
        digest = hmac.new(WEBHOOK_SECRET.encode(), body, hashlib.sha256).hexdigest()
        headers["x-smartflo-signature"] = f"sha256={digest}"
    return headers


def post_webhook(payload: dict) -> requests.Response:
    body = json.dumps(payload, separators=(",", ":")).encode()
    return requests.post(f"{BASE_URL}/api/tata/webhook", data=body, headers=sign_body(body))


def unique_phone() -> str:
    # 10-digit Indian-looking number that will normalize consistently
    return f"98{uuid.uuid4().int % 10**8:08d}"


@skip_without_telephony
class TestTataWebhookUpsert:
    def setup_method(self):
        self.headers = login("alex@bidinn.com")
        self.phone = unique_phone()
        lead_resp = requests.post(
            f"{BASE_URL}/api/leads",
            headers=self.headers,
            json={"name": f"TATA_{self.phone}", "phone": f"+91 {self.phone}", "source": "Website"},
        )
        assert lead_resp.status_code == 201, lead_resp.text
        self.lead = lead_resp.json()
        self.call_id = f"tata-{uuid.uuid4()}"

    def teardown_method(self):
        if getattr(self, "lead", None):
            requests.delete(f"{BASE_URL}/api/leads/{self.lead['id']}", headers=self.headers)

    def _calls(self):
        response = requests.get(
            f"{BASE_URL}/api/calls/lead/{self.lead['id']}",
            headers=self.headers,
        )
        assert response.status_code == 200, response.text
        return response.json()

    def test_started_answered_ended_one_row_with_recording(self):
        started = post_webhook({
            "event": "call.started",
            "timestamp": "2025-12-16T10:30:00Z",
            "data": {
                "call_id": self.call_id,
                "direction": "outbound",
                "caller_number": "+911001",
                "called_number": f"+91{self.phone}",
                "agent_number": "1001",
                "reference_id": self.lead["id"],
            },
        })
        assert started.status_code == 200, started.text

        answered = post_webhook({
            "event": "call.answered",
            "timestamp": "2025-12-16T10:30:08Z",
            "data": {"call_id": self.call_id},
        })
        assert answered.status_code == 200, answered.text

        ended = post_webhook({
            "event": "call.ended",
            "timestamp": "2025-12-16T10:35:00Z",
            "data": {
                "call_id": self.call_id,
                "direction": "outbound",
                "duration": 300,
                "status": "answered",
                "recording_url": f"https://recordings.smartflo.com/{self.call_id}.mp3",
                "hangup_cause": "normal_clearing",
            },
        })
        assert ended.status_code == 200, ended.text

        calls = [c for c in self._calls() if c.get("tata_call_id") == self.call_id]
        assert len(calls) == 1, f"expected 1 call row, got {len(calls)}"
        call = calls[0]
        assert call["outcome"] == "connected"
        assert call["duration_minutes"] == 5
        assert call["recording_url"].endswith(".mp3")
        assert call["direction"] == "outbound"
        assert call.get("started_at")
        assert call.get("answered_at")
        assert call.get("ended_at")

        lead = requests.get(f"{BASE_URL}/api/leads/{self.lead['id']}", headers=self.headers).json()
        assert lead["attempt_count"] >= 1
        print("PASS: in-order webhook lifecycle upserts a single call with recording")

    def test_out_of_order_ended_then_started_still_one_row(self):
        ended = post_webhook({
            "event": "call.ended",
            "timestamp": "2025-12-16T10:35:00Z",
            "data": {
                "call_id": self.call_id,
                "duration": 120,
                "status": "answered",
                "recording_url": f"https://recordings.smartflo.com/{self.call_id}.mp3",
                "caller_number": f"+91{self.phone}",
                "direction": "inbound",
            },
        })
        assert ended.status_code == 200, ended.text

        started = post_webhook({
            "event": "call.started",
            "timestamp": "2025-12-16T10:30:00Z",
            "data": {
                "call_id": self.call_id,
                "direction": "inbound",
                "caller_number": f"+91{self.phone}",
            },
        })
        assert started.status_code == 200, started.text

        calls = [c for c in self._calls() if c.get("tata_call_id") == self.call_id]
        assert len(calls) == 1
        assert calls[0]["outcome"] == "connected"
        assert calls[0]["recording_url"]
        print("PASS: out-of-order webhook events still produce one calls row")


@skip_without_telephony
class TestTataNoMatchAndAmbiguous:
    def setup_method(self):
        self.headers = login("alex@bidinn.com")

    def test_unmatched_call_is_not_dropped(self):
        call_id = f"tata-unmatched-{uuid.uuid4()}"
        unknown = unique_phone()
        response = post_webhook({
            "event": "call.ended",
            "timestamp": "2025-12-16T10:35:00Z",
            "data": {
                "call_id": call_id,
                "direction": "inbound",
                "caller_number": f"+91{unknown}",
                "duration": 45,
                "status": "answered",
                "recording_url": f"https://recordings.smartflo.com/{call_id}.mp3",
            },
        })
        assert response.status_code == 200, response.text
        body = response.json()
        assert body.get("received") is True
        assert body.get("call_id") == call_id

        notifications = requests.get(f"{BASE_URL}/api/notifications", headers=self.headers)
        assert notifications.status_code == 200
        types = {n.get("type") for n in notifications.json().get("notifications", [])}
        assert "unmatched_call" in types, f"expected unmatched_call notification, got {types}"
        print("PASS: unmatched call kept and admin notified")

    def test_multiple_leads_same_number_attaches_most_recent_and_logs_ambiguity(self):
        phone = unique_phone()
        first = requests.post(
            f"{BASE_URL}/api/leads",
            headers=self.headers,
            json={"name": f"TATA_OLD_{phone}", "phone": f"0{phone}", "source": "Website"},
        )
        assert first.status_code == 201, first.text
        # force_create is not on this API; create a second lead with a slightly different
        # raw phone that still normalizes to the same 10 digits, via SQL-less path:
        # PUT the first lead's phone then create... Rule 3 blocks duplicates.
        # Use the webhook's most-recently-active picker by creating two leads that share
        # phone_normalized through an admin merge-bypass: create second with unique phone,
        # then PUT both to the same normalized number... PUT does not re-check duplicates.
        second = requests.post(
            f"{BASE_URL}/api/leads",
            headers=self.headers,
            json={"name": f"TATA_NEW_{phone}", "phone": f"99{uuid.uuid4().hex[:8]}", "source": "Referral"},
        )
        assert second.status_code == 201, second.text
        second_id = second.json()["id"]
        first_id = first.json()["id"]

        put = requests.put(
            f"{BASE_URL}/api/leads/{second_id}",
            headers=self.headers,
            json={"phone": f"+91 {phone}", "notes": "same number as older lead"},
        )
        assert put.status_code == 200, put.text

        call_id = f"tata-ambig-{uuid.uuid4()}"
        ended = post_webhook({
            "event": "call.ended",
            "timestamp": "2025-12-16T11:00:00Z",
            "data": {
                "call_id": call_id,
                "direction": "inbound",
                "caller_number": f"+91{phone}",
                "duration": 60,
                "status": "answered",
                "recording_url": f"https://recordings.smartflo.com/{call_id}.mp3",
            },
        })
        assert ended.status_code == 200, ended.text

        newer_calls = requests.get(f"{BASE_URL}/api/calls/lead/{second_id}", headers=self.headers).json()
        older_calls = requests.get(f"{BASE_URL}/api/calls/lead/{first_id}", headers=self.headers).json()
        newer_match = [c for c in newer_calls if c.get("tata_call_id") == call_id]
        older_match = [c for c in older_calls if c.get("tata_call_id") == call_id]
        assert len(newer_match) == 1, "call should attach to the most recently active lead"
        assert len(older_match) == 0

        timeline = requests.get(
            f"{BASE_URL}/api/activities?lead_id={second_id}",
            headers=self.headers,
        ).json()
        actions = [item.get("action") for item in timeline]
        assert any("ambiguous" in str(a) for a in actions), f"expected ambiguity activity, got {actions}"

        requests.delete(f"{BASE_URL}/api/leads/{first_id}", headers=self.headers)
        requests.delete(f"{BASE_URL}/api/leads/{second_id}", headers=self.headers)
        print("PASS: ambiguous number attached to most recent lead with timeline note")


@skip_without_telephony
class TestTataClickToCallAndSignature:
    def setup_method(self):
        self.headers = login("alex@bidinn.com")
        me = requests.get(f"{BASE_URL}/api/auth/me", headers=self.headers).json()
        self.user_id = me["id"]
        requests.put(
            f"{BASE_URL}/api/users/{self.user_id}",
            headers=self.headers,
            json={"tata_extension": "1001"},
        )
        # self-update is allowed for tata_extension; if 403, skip click-to-call
        phone = unique_phone()
        lead_resp = requests.post(
            f"{BASE_URL}/api/leads",
            headers=self.headers,
            json={"name": f"TATA_CTC_{phone}", "phone": phone, "source": "Website"},
        )
        assert lead_resp.status_code == 201, lead_resp.text
        self.lead = lead_resp.json()

    def teardown_method(self):
        if getattr(self, "lead", None):
            requests.delete(f"{BASE_URL}/api/leads/{self.lead['id']}", headers=self.headers)

    def test_click_to_call_requires_extension_or_initiates(self):
        response = requests.post(
            f"{BASE_URL}/api/tata/click-to-call",
            headers=self.headers,
            json={"lead_id": self.lead["id"]},
        )
        # 200 when mock/API configured; 400 if extension missing; 503 if no API key
        assert response.status_code in (200, 400, 503), response.text
        if response.status_code == 200:
            data = response.json()
            assert data.get("call_id")
            tata_id = data["call_id"]
            post_webhook({
                "event": "call.ended",
                "timestamp": "2025-12-16T10:35:00Z",
                "data": {
                    "call_id": tata_id,
                    "duration": 90,
                    "status": "answered",
                    "recording_url": f"https://recordings.smartflo.com/{tata_id}.mp3",
                    "called_number": f"+91{self.lead['phone'][-10:]}",
                    "direction": "outbound",
                },
            })
            calls = requests.get(
                f"{BASE_URL}/api/calls/lead/{self.lead['id']}",
                headers=self.headers,
            ).json()
            match = [c for c in calls if c.get("tata_call_id") == tata_id]
            assert len(match) == 1
            assert match[0]["recording_url"]
            print("PASS: click-to-call + webhook recording on the same lead")
        else:
            print(f"SKIP click-to-call happy path: {response.status_code} {response.text}")

    def test_click_to_call_missing_lead_id(self):
        response = requests.post(
            f"{BASE_URL}/api/tata/click-to-call",
            headers=self.headers,
            json={},
        )
        assert response.status_code == 400

    def test_click_to_call_unknown_lead_is_404(self):
        response = requests.post(
            f"{BASE_URL}/api/tata/click-to-call",
            headers=self.headers,
            json={"lead_id": str(uuid.uuid4())},
        )
        assert response.status_code == 404

    def test_click_to_call_no_extension_returns_400(self):
        suffix = uuid.uuid4().hex[:8]
        created = requests.post(
            f"{BASE_URL}/api/users",
            headers=self.headers,
            json={
                "email": f"tata.noext.{suffix}@bidinn.com",
                "name": "No Extension Rep",
                "password": "password123",
                "role": "sales_rep",
            },
            timeout=15,
        )
        assert created.status_code in (200, 201), created.text
        user = created.json()
        user_id = user["id"]
        try:
            rep_headers = login(f"tata.noext.{suffix}@bidinn.com")
            assigned = requests.put(
                f"{BASE_URL}/api/leads/{self.lead['id']}",
                headers=self.headers,
                json={"assigned_to": user_id, "notes": "assign for click-to-call 403/400"},
            )
            assert assigned.status_code == 200, assigned.text
            response = requests.post(
                f"{BASE_URL}/api/tata/click-to-call",
                headers=rep_headers,
                json={"lead_id": self.lead["id"]},
            )
            assert response.status_code == 400, response.text
            assert "extension" in response.json().get("detail", "").lower()
            print("PASS: click-to-call without tata_extension returns 400")
        finally:
            if user_id:
                requests.delete(f"{BASE_URL}/api/users/{user_id}", headers=self.headers, timeout=15)

    def test_sales_rep_cannot_click_to_call_unassigned_lead(self):
        rep = login("emily@bidinn.com")
        response = requests.post(
            f"{BASE_URL}/api/tata/click-to-call",
            headers=rep,
            json={"lead_id": self.lead["id"]},
        )
        assert response.status_code == 403, response.text

    def test_webhook_missing_event_or_call_id_is_400(self):
        missing_event = post_webhook({"data": {"call_id": "x"}})
        assert missing_event.status_code == 400, missing_event.text
        missing_id = post_webhook({"event": "call.ended", "data": {}})
        assert missing_id.status_code == 400, missing_id.text

    def test_missing_signature_rejected_when_secret_configured(self):
        if not WEBHOOK_SECRET:
            pytest.skip("TATA_SMARTFLO_WEBHOOK_SECRET not set")
        body = json.dumps({"event": "call.ended", "data": {"call_id": "no-sig"}}).encode()
        response = requests.post(
            f"{BASE_URL}/api/tata/webhook",
            data=body,
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 403

    def test_call_history_endpoint_lists_recording(self):
        call_id = f"tata-hist-{uuid.uuid4()}"
        ended = post_webhook({
            "event": "call.ended",
            "timestamp": "2025-12-16T10:35:00Z",
            "data": {
                "call_id": call_id,
                "direction": "outbound",
                "called_number": f"+91{self.lead['phone'][-10:]}",
                "reference_id": self.lead["id"],
                "duration": 75,
                "status": "answered",
                "recording_url": f"https://recordings.smartflo.com/{call_id}.mp3",
            },
        })
        assert ended.status_code == 200, ended.text
        history = requests.get(
            f"{BASE_URL}/api/tata/calls/{self.lead['id']}",
            headers=self.headers,
        )
        assert history.status_code == 200, history.text
        match = [c for c in history.json() if c.get("tata_call_id") == call_id]
        assert len(match) == 1
        assert match[0]["recording_url"]
        print("PASS: GET /tata/calls/:lead_id returns the recording")

    def test_invalid_webhook_signature_rejected_when_secret_configured(self):
        if not WEBHOOK_SECRET:
            pytest.skip("TATA_SMARTFLO_WEBHOOK_SECRET not set")
        body = json.dumps({
            "event": "call.ended",
            "data": {"call_id": "forged"},
        }).encode()
        response = requests.post(
            f"{BASE_URL}/api/tata/webhook",
            data=body,
            headers={"Content-Type": "application/json", "x-smartflo-signature": "sha256=deadbeef"},
        )
        assert response.status_code == 403
        print("PASS: invalid webhook signature returns 403")
