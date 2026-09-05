"""Shared pytest fixtures for Bidinn CRM API tests."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")

DEMO_USERS = [
    {"email": "sarah@bidinn.com", "name": "Sarah Wilson", "role": "manager", "password": "password123"},
    {"email": "michael@bidinn.com", "name": "Michael Chen", "role": "team_lead", "password": "password123"},
    {"email": "emily@bidinn.com", "name": "Emily Davis", "role": "sales_rep", "password": "password123"},
]


@pytest.fixture(scope="session", autouse=True)
def seed_demo_users():
    if not BASE_URL:
        return
    login = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": "alex@bidinn.com", "password": "password123"},
        timeout=15,
    )
    if login.status_code != 200:
        return
    token = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    users_resp = requests.get(f"{BASE_URL}/api/users", headers=headers, timeout=15)
    if users_resp.status_code != 200:
        return
    existing = {u["email"] for u in users_resp.json()}
    for user in DEMO_USERS:
        if user["email"] not in existing:
            requests.post(f"{BASE_URL}/api/users", headers=headers, json=user, timeout=15)
