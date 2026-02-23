"""
Bidinn CRM - New Features Tests
Tests for: Date range filter, Auto-reset job, CSV export, User deactivation/reactivation/password reset
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "alex@bidinn.com"
PASSWORD = "password123"


class TestAgentPerformanceWithDateFilter:
    """Tests for agent performance endpoint with date range filters"""
    
    @pytest.fixture
    def auth_token(self):
        """Get admin authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": PASSWORD
        })
        return response.json()["access_token"]
    
    def test_agent_performance_no_filter(self, auth_token):
        """Test agent performance without date filter (all time)"""
        response = requests.get(f"{BASE_URL}/api/dashboard/agent-performance", headers={
            "Authorization": f"Bearer {auth_token}"
        })
        assert response.status_code == 200
        data = response.json()
        
        # Verify response structure
        assert "agents" in data
        assert "team_summary" in data
        assert "all_agents" in data
        
        # Verify team summary fields
        team_summary = data["team_summary"]
        assert "total_leads" in team_summary
        assert "contacted" in team_summary
        assert "not_contacted" in team_summary
        assert "converted" in team_summary
        assert "total_revenue" in team_summary
        assert "calls_made" in team_summary
        assert "conversion_rate" in team_summary
        assert "agent_count" in team_summary
        
        print(f"✓ Agent performance (all time): {len(data['agents'])} agents, {team_summary['total_leads']} total leads")
    
    def test_agent_performance_last_7_days(self, auth_token):
        """Test agent performance with last 7 days filter"""
        from datetime import datetime, timedelta
        
        end_date = datetime.now().strftime('%Y-%m-%d')
        start_date = (datetime.now() - timedelta(days=7)).strftime('%Y-%m-%d')
        
        response = requests.get(
            f"{BASE_URL}/api/dashboard/agent-performance?start_date={start_date}&end_date={end_date}",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        assert "agents" in data
        assert "team_summary" in data
        print(f"✓ Agent performance (last 7 days): {data['team_summary']['total_leads']} leads")
    
    def test_agent_performance_last_30_days(self, auth_token):
        """Test agent performance with last 30 days filter"""
        from datetime import datetime, timedelta
        
        end_date = datetime.now().strftime('%Y-%m-%d')
        start_date = (datetime.now() - timedelta(days=30)).strftime('%Y-%m-%d')
        
        response = requests.get(
            f"{BASE_URL}/api/dashboard/agent-performance?start_date={start_date}&end_date={end_date}",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        assert "agents" in data
        assert "team_summary" in data
        print(f"✓ Agent performance (last 30 days): {data['team_summary']['total_leads']} leads")
    
    def test_agent_performance_this_month(self, auth_token):
        """Test agent performance with this month filter"""
        from datetime import datetime
        
        now = datetime.now()
        start_date = datetime(now.year, now.month, 1).strftime('%Y-%m-%d')
        end_date = now.strftime('%Y-%m-%d')
        
        response = requests.get(
            f"{BASE_URL}/api/dashboard/agent-performance?start_date={start_date}&end_date={end_date}",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        assert "agents" in data
        assert "team_summary" in data
        print(f"✓ Agent performance (this month): {data['team_summary']['total_leads']} leads")
    
    def test_agent_performance_custom_date_range(self, auth_token):
        """Test agent performance with custom date range"""
        response = requests.get(
            f"{BASE_URL}/api/dashboard/agent-performance?start_date=2024-01-01&end_date=2024-12-31",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        assert "agents" in data
        assert "team_summary" in data
        print(f"✓ Agent performance (custom range 2024): {data['team_summary']['total_leads']} leads")
    
    def test_agent_performance_specific_agent(self, auth_token):
        """Test agent performance for a specific agent"""
        # First get all agents
        response = requests.get(f"{BASE_URL}/api/dashboard/agent-performance", headers={
            "Authorization": f"Bearer {auth_token}"
        })
        data = response.json()
        
        if len(data['all_agents']) > 0:
            agent_id = data['all_agents'][0]['id']
            
            response = requests.get(
                f"{BASE_URL}/api/dashboard/agent-performance?agent_id={agent_id}",
                headers={"Authorization": f"Bearer {auth_token}"}
            )
            assert response.status_code == 200
            filtered_data = response.json()
            
            # Should only have one agent
            assert len(filtered_data['agents']) == 1
            assert filtered_data['agents'][0]['agent_id'] == agent_id
            print(f"✓ Agent performance (specific agent): {filtered_data['agents'][0]['agent_name']}")


class TestLeadsExport:
    """Tests for leads export to CSV functionality"""
    
    @pytest.fixture
    def auth_token(self):
        """Get admin authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": PASSWORD
        })
        return response.json()["access_token"]
    
    def test_export_leads_csv(self, auth_token):
        """Test exporting leads to CSV"""
        response = requests.get(
            f"{BASE_URL}/api/leads/export?format=csv",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        
        # Check content type
        content_type = response.headers.get('Content-Type', '')
        assert 'text/csv' in content_type
        
        # Check content disposition
        content_disposition = response.headers.get('Content-Disposition', '')
        assert 'attachment' in content_disposition
        assert 'leads_export' in content_disposition
        
        # Verify CSV content
        csv_content = response.text
        assert 'Name' in csv_content
        assert 'Phone' in csv_content
        assert 'Status' in csv_content
        
        lines = csv_content.strip().split('\n')
        assert len(lines) > 1  # Header + at least one data row
        print(f"✓ CSV export successful: {len(lines) - 1} leads exported")
    
    def test_export_leads_xlsx(self, auth_token):
        """Test exporting leads to XLSX"""
        response = requests.get(
            f"{BASE_URL}/api/leads/export?format=xlsx",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        
        # Check content type
        content_type = response.headers.get('Content-Type', '')
        assert 'spreadsheet' in content_type or 'application/vnd' in content_type
        
        # Check content disposition
        content_disposition = response.headers.get('Content-Disposition', '')
        assert 'attachment' in content_disposition
        assert 'leads_export' in content_disposition
        
        print("✓ XLSX export successful")
    
    def test_export_leads_with_status_filter(self, auth_token):
        """Test exporting leads with status filter"""
        response = requests.get(
            f"{BASE_URL}/api/leads/export?format=csv&status=new",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        
        csv_content = response.text
        lines = csv_content.strip().split('\n')
        print(f"✓ CSV export with status filter: {len(lines) - 1} new leads exported")
    
    def test_export_leads_with_source_filter(self, auth_token):
        """Test exporting leads with source filter"""
        response = requests.get(
            f"{BASE_URL}/api/leads/export?format=csv&source=Website",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        
        csv_content = response.text
        lines = csv_content.strip().split('\n')
        print(f"✓ CSV export with source filter: {len(lines) - 1} Website leads exported")


class TestAutoResetJob:
    """Tests for 30-day auto-reset job endpoint"""
    
    @pytest.fixture
    def auth_token(self):
        """Get admin authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": PASSWORD
        })
        return response.json()["access_token"]
    
    def test_run_auto_reset_admin(self, auth_token):
        """Test running auto-reset job as admin"""
        response = requests.post(
            f"{BASE_URL}/api/admin/run-auto-reset",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        assert "message" in data
        assert "Auto-reset completed" in data["message"]
        print(f"✓ Auto-reset job executed: {data['message']}")
    
    def test_run_auto_reset_non_admin_forbidden(self):
        """Test that non-admin cannot run auto-reset job"""
        # Login as sales rep
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "emily@bidinn.com",
            "password": PASSWORD
        })
        token = login_response.json()["access_token"]
        
        response = requests.post(
            f"{BASE_URL}/api/admin/run-auto-reset",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 403
        print("✓ Non-admin correctly denied auto-reset access")


class TestUserManagement:
    """Tests for user deactivation, reactivation, and password reset"""
    
    @pytest.fixture
    def auth_token(self):
        """Get admin authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": PASSWORD
        })
        return response.json()["access_token"]
    
    @pytest.fixture
    def test_user(self, auth_token):
        """Create a test user for testing"""
        test_email = f"TEST_user_mgmt_{int(time.time())}@bidinn.com"
        response = requests.post(f"{BASE_URL}/api/auth/register", json={
            "email": test_email,
            "name": "Test User Management",
            "password": "testpass123",
            "role": "sales_rep"
        })
        if response.status_code == 201:
            return response.json()
        return None
    
    def test_toggle_user_status_deactivate(self, auth_token, test_user):
        """Test deactivating a user"""
        if not test_user:
            pytest.skip("Could not create test user")
        
        user_id = test_user["id"]
        
        # Deactivate user
        response = requests.post(
            f"{BASE_URL}/api/users/{user_id}/toggle-status",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        assert data["is_active"] == False
        assert "deactivated" in data.get("message", "").lower()
        print(f"✓ User deactivated: {test_user['name']}")
    
    def test_toggle_user_status_reactivate(self, auth_token, test_user):
        """Test reactivating a user"""
        if not test_user:
            pytest.skip("Could not create test user")
        
        user_id = test_user["id"]
        
        # First deactivate
        requests.post(
            f"{BASE_URL}/api/users/{user_id}/toggle-status",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        
        # Then reactivate
        response = requests.post(
            f"{BASE_URL}/api/users/{user_id}/toggle-status",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        assert data["is_active"] == True
        assert "activated" in data.get("message", "").lower()
        print(f"✓ User reactivated: {test_user['name']}")
    
    def test_cannot_deactivate_self(self, auth_token):
        """Test that admin cannot deactivate their own account"""
        # Get admin user ID
        me_response = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        admin_id = me_response.json()["id"]
        
        # Try to deactivate self
        response = requests.post(
            f"{BASE_URL}/api/users/{admin_id}/toggle-status",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 400
        data = response.json()
        assert "own account" in data.get("detail", "").lower()
        print("✓ Admin correctly prevented from self-deactivation")
    
    def test_reset_password(self, auth_token, test_user):
        """Test resetting a user's password"""
        if not test_user:
            pytest.skip("Could not create test user")
        
        user_id = test_user["id"]
        new_password = "newpassword123"
        
        response = requests.post(
            f"{BASE_URL}/api/users/{user_id}/reset-password",
            json={"new_password": new_password},
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        assert "message" in data
        assert "reset" in data["message"].lower()
        
        # Verify new password works
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": test_user["email"],
            "password": new_password
        })
        assert login_response.status_code == 200
        print(f"✓ Password reset successful for: {test_user['name']}")
    
    def test_reset_password_too_short(self, auth_token, test_user):
        """Test that short passwords are rejected"""
        if not test_user:
            pytest.skip("Could not create test user")
        
        user_id = test_user["id"]
        
        response = requests.post(
            f"{BASE_URL}/api/users/{user_id}/reset-password",
            json={"new_password": "12345"},  # Too short
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 400
        print("✓ Short password correctly rejected")
    
    def test_non_admin_cannot_toggle_status(self):
        """Test that non-admin cannot toggle user status"""
        # Login as manager (not admin)
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "sarah@bidinn.com",
            "password": PASSWORD
        })
        token = login_response.json()["access_token"]
        
        # Get a user to try to deactivate
        users_response = requests.get(
            f"{BASE_URL}/api/users",
            headers={"Authorization": f"Bearer {token}"}
        )
        users = users_response.json()
        
        if len(users) > 0:
            user_id = users[0]["id"]
            response = requests.post(
                f"{BASE_URL}/api/users/{user_id}/toggle-status",
                headers={"Authorization": f"Bearer {token}"}
            )
            assert response.status_code == 403
            print("✓ Non-admin correctly denied toggle status access")
    
    def test_non_admin_cannot_reset_password(self):
        """Test that non-admin cannot reset passwords"""
        # Login as manager (not admin)
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "sarah@bidinn.com",
            "password": PASSWORD
        })
        token = login_response.json()["access_token"]
        
        # Get a user to try to reset password
        users_response = requests.get(
            f"{BASE_URL}/api/users",
            headers={"Authorization": f"Bearer {token}"}
        )
        users = users_response.json()
        
        if len(users) > 0:
            user_id = users[0]["id"]
            response = requests.post(
                f"{BASE_URL}/api/users/{user_id}/reset-password",
                json={"new_password": "newpassword123"},
                headers={"Authorization": f"Bearer {token}"}
            )
            assert response.status_code == 403
            print("✓ Non-admin correctly denied password reset access")


class TestAuthenticationAfterChanges:
    """Test that authentication still works after all changes"""
    
    def test_admin_login_still_works(self):
        """Test admin login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["user"]["role"] == "admin"
        print(f"✓ Admin login working: {data['user']['name']}")
    
    def test_manager_login_still_works(self):
        """Test manager login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "sarah@bidinn.com",
            "password": PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["user"]["role"] == "manager"
        print(f"✓ Manager login working: {data['user']['name']}")
    
    def test_sales_rep_login_still_works(self):
        """Test sales rep login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "emily@bidinn.com",
            "password": PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["user"]["role"] == "sales_rep"
        print(f"✓ Sales rep login working: {data['user']['name']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
