"""
Test P2 Features for Bidinn CRM:
1. Bulk Export Filtering - filter leads before exporting to CSV
2. Bulk Lead Assignment - assign multiple leads to a sales rep
3. Sales Rep Dashboard - uncontacted and overdue leads endpoints
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestP2Features:
    """Test P2 features: Export filtering, Bulk assign, Dashboard alerts"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as Team Lead for most tests
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "michael@bidinn.com",
            "password": "password123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        self.team_lead_token = response.json().get("access_token")
        self.session.headers.update({"Authorization": f"Bearer {self.team_lead_token}"})
        
        # Also get Sales Rep token
        sales_rep_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "emily@bidinn.com",
            "password": "password123"
        })
        assert sales_rep_response.status_code == 200
        self.sales_rep_token = sales_rep_response.json().get("access_token")
    
    # ==================== Export Filtering Tests ====================
    
    def test_export_leads_no_filter(self):
        """Test exporting all leads without filters"""
        response = self.session.get(f"{BASE_URL}/api/leads/export?format=csv")
        assert response.status_code == 200
        assert "text/csv" in response.headers.get("Content-Type", "")
        
        # Verify CSV has headers
        content = response.text
        assert "Name,Phone,Email,Source" in content
        print("PASS: Export all leads returns valid CSV")
    
    def test_export_leads_with_status_filter(self):
        """Test exporting leads filtered by status"""
        response = self.session.get(f"{BASE_URL}/api/leads/export?status=new&format=csv")
        assert response.status_code == 200
        
        content = response.text
        lines = content.strip().split('\n')
        assert len(lines) >= 2, "Should have header + at least 1 data row"
        
        # Verify all exported leads have 'new' status
        for line in lines[1:]:
            assert ",new," in line.lower() or "new" in line.lower()
        print(f"PASS: Export with status=new filter returns {len(lines)-1} leads")
    
    def test_export_leads_with_source_filter(self):
        """Test exporting leads filtered by source"""
        response = self.session.get(f"{BASE_URL}/api/leads/export?source=Website&format=csv")
        assert response.status_code == 200
        
        content = response.text
        lines = content.strip().split('\n')
        assert len(lines) >= 1, "Should have at least header row"
        print(f"PASS: Export with source=Website filter returns {len(lines)-1} leads")
    
    def test_export_leads_with_multiple_filters(self):
        """Test exporting leads with multiple filters"""
        response = self.session.get(f"{BASE_URL}/api/leads/export?status=new&source=Website&format=csv")
        assert response.status_code == 200
        assert "text/csv" in response.headers.get("Content-Type", "")
        print("PASS: Export with multiple filters works")
    
    # ==================== Bulk Assign Tests ====================
    
    def test_bulk_assign_leads(self):
        """Test bulk assigning leads to a sales rep"""
        # Get some lead IDs
        leads_response = self.session.get(f"{BASE_URL}/api/leads?limit=3")
        assert leads_response.status_code == 200
        leads = leads_response.json()
        assert len(leads) >= 2, "Need at least 2 leads for bulk assign test"
        
        lead_ids = [leads[0]["id"], leads[1]["id"]]
        
        # Get a sales rep ID
        users_response = self.session.get(f"{BASE_URL}/api/users")
        assert users_response.status_code == 200
        users = users_response.json()
        sales_rep = next((u for u in users if u["role"] == "sales_rep"), None)
        assert sales_rep is not None, "Need a sales rep for bulk assign test"
        
        # Bulk assign
        response = self.session.post(f"{BASE_URL}/api/leads/bulk-assign", json={
            "lead_ids": lead_ids,
            "assignee_id": sales_rep["id"]
        })
        assert response.status_code == 200
        data = response.json()
        assert "updated_count" in data
        assert data["updated_count"] == 2
        print(f"PASS: Bulk assigned 2 leads to {sales_rep['name']}")
    
    def test_bulk_assign_invalid_assignee(self):
        """Test bulk assign with invalid assignee ID"""
        leads_response = self.session.get(f"{BASE_URL}/api/leads?limit=1")
        leads = leads_response.json()
        
        response = self.session.post(f"{BASE_URL}/api/leads/bulk-assign", json={
            "lead_ids": [leads[0]["id"]],
            "assignee_id": "invalid-uuid-12345"
        })
        assert response.status_code == 404
        print("PASS: Bulk assign with invalid assignee returns 404")
    
    def test_bulk_assign_empty_lead_ids(self):
        """Test bulk assign with empty lead_ids array"""
        response = self.session.post(f"{BASE_URL}/api/leads/bulk-assign", json={
            "lead_ids": [],
            "assignee_id": "some-id"
        })
        assert response.status_code == 400
        print("PASS: Bulk assign with empty lead_ids returns 400")
    
    # ==================== Sales Rep Dashboard Tests ====================
    
    def test_uncontacted_leads_endpoint_sales_rep(self):
        """Test /api/leads/uncontacted endpoint for Sales Rep"""
        headers = {"Authorization": f"Bearer {self.sales_rep_token}"}
        response = requests.get(f"{BASE_URL}/api/leads/uncontacted", headers=headers)
        assert response.status_code == 200
        
        leads = response.json()
        assert isinstance(leads, list)
        
        # Verify all returned leads are uncontacted (new status, 0 attempts)
        for lead in leads:
            assert lead["status"] == "new"
            assert lead["attempt_count"] == 0
            assert lead.get("is_overdue") == True
        
        print(f"PASS: Uncontacted leads endpoint returns {len(leads)} leads for Sales Rep")
    
    def test_uncontacted_leads_endpoint_team_lead(self):
        """Test /api/leads/uncontacted endpoint for Team Lead"""
        response = self.session.get(f"{BASE_URL}/api/leads/uncontacted")
        assert response.status_code == 200
        
        leads = response.json()
        assert isinstance(leads, list)
        print(f"PASS: Uncontacted leads endpoint returns {len(leads)} leads for Team Lead")
    
    def test_overdue_followups_endpoint_sales_rep(self):
        """Test /api/dashboard/overdue-followups endpoint for Sales Rep"""
        headers = {"Authorization": f"Bearer {self.sales_rep_token}"}
        response = requests.get(f"{BASE_URL}/api/dashboard/overdue-followups", headers=headers)
        assert response.status_code == 200
        
        leads = response.json()
        assert isinstance(leads, list)
        print(f"PASS: Overdue followups endpoint returns {len(leads)} leads for Sales Rep")
    
    def test_overdue_followups_endpoint_team_lead(self):
        """Test /api/dashboard/overdue-followups endpoint for Team Lead"""
        response = self.session.get(f"{BASE_URL}/api/dashboard/overdue-followups")
        assert response.status_code == 200
        
        leads = response.json()
        assert isinstance(leads, list)
        
        # Verify all returned leads have overdue follow-ups
        for lead in leads:
            assert lead.get("next_followup") is not None
            assert lead["status"] not in ["won", "lost", "not_interested"]
        
        print(f"PASS: Overdue followups endpoint returns {len(leads)} leads for Team Lead")
    
    # ==================== Dashboard Stats Tests ====================
    
    def test_dashboard_stats_includes_uncontacted_count(self):
        """Test dashboard stats includes uncontacted_over_1hr count"""
        response = self.session.get(f"{BASE_URL}/api/dashboard/stats")
        assert response.status_code == 200
        
        stats = response.json()
        assert "uncontacted_over_1hr" in stats
        assert isinstance(stats["uncontacted_over_1hr"], int)
        print(f"PASS: Dashboard stats includes uncontacted_over_1hr: {stats['uncontacted_over_1hr']}")
    
    def test_dashboard_stats_includes_overdue_followups(self):
        """Test dashboard stats includes overdue_followups count"""
        response = self.session.get(f"{BASE_URL}/api/dashboard/stats")
        assert response.status_code == 200
        
        stats = response.json()
        assert "overdue_followups" in stats
        assert isinstance(stats["overdue_followups"], int)
        print(f"PASS: Dashboard stats includes overdue_followups: {stats['overdue_followups']}")


class TestBulkStatusUpdate:
    """Test bulk status update feature"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "michael@bidinn.com",
            "password": "password123"
        })
        assert response.status_code == 200
        token = response.json().get("access_token")
        self.session.headers.update({"Authorization": f"Bearer {token}"})
    
    def test_bulk_status_update(self):
        """Test bulk updating lead status"""
        # Get some lead IDs
        leads_response = self.session.get(f"{BASE_URL}/api/leads?limit=2")
        leads = leads_response.json()
        lead_ids = [leads[0]["id"], leads[1]["id"]]
        
        # Bulk update status
        response = self.session.post(f"{BASE_URL}/api/leads/bulk-update-status", json={
            "lead_ids": lead_ids,
            "status": "interested"
        })
        assert response.status_code == 200
        data = response.json()
        assert data["updated_count"] == 2
        print("PASS: Bulk status update works")
    
    def test_bulk_status_update_invalid_status(self):
        """Test bulk status update with invalid status"""
        leads_response = self.session.get(f"{BASE_URL}/api/leads?limit=1")
        leads = leads_response.json()
        
        response = self.session.post(f"{BASE_URL}/api/leads/bulk-update-status", json={
            "lead_ids": [leads[0]["id"]],
            "status": "invalid_status"
        })
        assert response.status_code == 400
        print("PASS: Bulk status update with invalid status returns 400")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
