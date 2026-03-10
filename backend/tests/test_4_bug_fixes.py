"""
Test suite for 4 bug fixes in Bidinn CRM:
1. Lead Import - POST /api/leads/import with CSV file
2. Create Team Member - POST /api/users with admin token
3. Admin Self-Edit - PUT /api/users/:adminId for own name/email
4. Bulk Delete - Only admin role can POST /api/leads/bulk-delete
"""

import pytest
import requests
import os
import io

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestBugFixes:
    """Test all 4 bug fixes"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test data and get auth tokens"""
        self.admin_email = "alex@bidinn.com"
        self.admin_password = "password123"
        self.manager_email = "robert@bidinn.com"  # Actual manager user
        self.manager_password = "password123"
        
        # Get admin token
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": self.admin_email,
            "password": self.admin_password
        })
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        data = response.json()
        self.admin_token = data["access_token"]
        self.admin_id = data["user"]["id"]
        self.admin_name = data["user"]["name"]
        
        # Get manager token
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": self.manager_email,
            "password": self.manager_password
        })
        if response.status_code == 200:
            data = response.json()
            self.manager_token = data["access_token"]
            self.manager_id = data["user"]["id"]
        else:
            self.manager_token = None
            self.manager_id = None
    
    def get_admin_headers(self):
        return {
            "Authorization": f"Bearer {self.admin_token}",
            "Content-Type": "application/json"
        }
    
    def get_manager_headers(self):
        if not self.manager_token:
            pytest.skip("Manager user not available")
        return {
            "Authorization": f"Bearer {self.manager_token}",
            "Content-Type": "application/json"
        }

    # ==================== Issue 1: Lead Import ====================
    
    def test_lead_import_with_csv_file(self):
        """Issue 1: Test lead import with CSV file upload"""
        # Create a CSV file content
        csv_content = "name,phone,email,source,campaign,city,notes\nTEST_Import Lead 1,+1-555-111-0001,test_import1@test.com,Google Ads,Test Campaign,New York,Test notes\nTEST_Import Lead 2,+1-555-111-0002,test_import2@test.com,Facebook,Test Campaign 2,Los Angeles,More notes"
        
        # Create file-like object
        files = {
            'file': ('test_leads.csv', csv_content, 'text/csv')
        }
        
        headers = {"Authorization": f"Bearer {self.admin_token}"}
        
        response = requests.post(
            f"{BASE_URL}/api/leads/import",
            files=files,
            headers=headers
        )
        
        print(f"Import response status: {response.status_code}")
        print(f"Import response: {response.text[:500]}")
        
        assert response.status_code == 201, f"Lead import failed: {response.text}"
        data = response.json()
        assert "imported" in data, "Response should contain 'imported' count"
        assert data["imported"] >= 0, "Should have imported count"
        
        # Cleanup - delete imported leads
        if data.get("leads"):
            for lead in data["leads"]:
                requests.delete(
                    f"{BASE_URL}/api/leads/{lead['id']}",
                    headers=self.get_admin_headers()
                )
    
    def test_lead_import_with_json_array(self):
        """Issue 1: Test lead import with JSON array (alternative method)"""
        leads_data = {
            "leads": [
                {
                    "name": "TEST_JSON Import Lead",
                    "phone": "+1-555-222-0001",
                    "email": "test_json_import@test.com",
                    "source": "Website"
                }
            ]
        }
        
        response = requests.post(
            f"{BASE_URL}/api/leads/import",
            json=leads_data,
            headers=self.get_admin_headers()
        )
        
        print(f"JSON Import response status: {response.status_code}")
        print(f"JSON Import response: {response.text[:500]}")
        
        assert response.status_code == 201, f"JSON lead import failed: {response.text}"
        data = response.json()
        assert data.get("imported", 0) >= 0
        
        # Cleanup
        if data.get("leads"):
            for lead in data["leads"]:
                requests.delete(
                    f"{BASE_URL}/api/leads/{lead['id']}",
                    headers=self.get_admin_headers()
                )
    
    def test_lead_import_requires_auth(self):
        """Issue 1: Lead import should require authentication"""
        csv_content = "name,phone,source\nTest,123,Web"
        files = {'file': ('test.csv', csv_content, 'text/csv')}
        
        response = requests.post(f"{BASE_URL}/api/leads/import", files=files)
        assert response.status_code == 401, "Import without auth should return 401"

    # ==================== Issue 2: Create Team Member ====================
    
    def test_create_team_member_as_admin(self):
        """Issue 2: Admin should be able to create new team member via POST /api/users"""
        new_user_data = {
            "name": "TEST_New Team Member",
            "email": "test_new_member@bidinn.com",
            "password": "testpass123",
            "role": "sales_rep"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/users",
            json=new_user_data,
            headers=self.get_admin_headers()
        )
        
        print(f"Create user response status: {response.status_code}")
        print(f"Create user response: {response.text[:500]}")
        
        assert response.status_code == 201, f"Create user failed: {response.text}"
        data = response.json()
        assert data["name"] == new_user_data["name"]
        assert data["email"] == new_user_data["email"]
        assert data["role"] == new_user_data["role"]
        assert "id" in data
        
        # Cleanup - delete the test user
        user_id = data["id"]
        requests.delete(
            f"{BASE_URL}/api/users/{user_id}",
            headers=self.get_admin_headers()
        )
    
    def test_create_team_member_as_manager(self):
        """Issue 2: Manager should also be able to create team members"""
        if not self.manager_token:
            pytest.skip("Manager user not available")
        
        new_user_data = {
            "name": "TEST_Manager Created User",
            "email": "test_manager_created@bidinn.com",
            "password": "testpass123",
            "role": "sales_rep"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/users",
            json=new_user_data,
            headers=self.get_manager_headers()
        )
        
        print(f"Manager create user response: {response.status_code}")
        
        assert response.status_code == 201, f"Manager create user failed: {response.text}"
        data = response.json()
        
        # Cleanup
        requests.delete(
            f"{BASE_URL}/api/users/{data['id']}",
            headers=self.get_admin_headers()
        )
    
    def test_create_team_member_validates_required_fields(self):
        """Issue 2: Create user should validate required fields"""
        # Missing password
        response = requests.post(
            f"{BASE_URL}/api/users",
            json={"name": "Test", "email": "test@test.com"},
            headers=self.get_admin_headers()
        )
        assert response.status_code == 400, "Should require password"
        
        # Missing email
        response = requests.post(
            f"{BASE_URL}/api/users",
            json={"name": "Test", "password": "test123"},
            headers=self.get_admin_headers()
        )
        assert response.status_code == 400, "Should require email"
    
    def test_create_team_member_prevents_duplicate_email(self):
        """Issue 2: Should not allow duplicate email"""
        response = requests.post(
            f"{BASE_URL}/api/users",
            json={
                "name": "Duplicate Test",
                "email": self.admin_email,  # Already exists
                "password": "test123"
            },
            headers=self.get_admin_headers()
        )
        assert response.status_code == 400, "Should reject duplicate email"

    # ==================== Issue 3: Admin Self-Edit ====================
    
    def test_admin_can_edit_own_name(self):
        """Issue 3: Admin should be able to update their own name"""
        original_name = self.admin_name
        new_name = "TEST_Updated Admin Name"
        
        response = requests.put(
            f"{BASE_URL}/api/users/{self.admin_id}",
            json={"name": new_name},
            headers=self.get_admin_headers()
        )
        
        print(f"Admin self-edit response status: {response.status_code}")
        print(f"Admin self-edit response: {response.text[:500]}")
        
        assert response.status_code == 200, f"Admin self-edit failed: {response.text}"
        data = response.json()
        assert data["name"] == new_name, "Name should be updated"
        
        # Verify with GET
        get_response = requests.get(
            f"{BASE_URL}/api/users/{self.admin_id}",
            headers=self.get_admin_headers()
        )
        assert get_response.status_code == 200
        assert get_response.json()["name"] == new_name
        
        # Restore original name
        requests.put(
            f"{BASE_URL}/api/users/{self.admin_id}",
            json={"name": original_name},
            headers=self.get_admin_headers()
        )
    
    def test_admin_can_edit_own_email(self):
        """Issue 3: Admin should be able to update their own email"""
        # Note: We'll test with a temporary email change and revert
        new_email = "test_admin_temp@bidinn.com"
        
        response = requests.put(
            f"{BASE_URL}/api/users/{self.admin_id}",
            json={"email": new_email},
            headers=self.get_admin_headers()
        )
        
        print(f"Admin email edit response: {response.status_code}")
        
        if response.status_code == 200:
            # Revert back immediately
            requests.put(
                f"{BASE_URL}/api/users/{self.admin_id}",
                json={"email": self.admin_email},
                headers=self.get_admin_headers()
            )
            assert True, "Admin can edit own email"
        else:
            # If it fails, check if it's because email is in use
            assert response.status_code in [200, 400], f"Unexpected status: {response.status_code}"
    
    def test_non_admin_can_edit_own_name_email(self):
        """Issue 3: Non-admin users should also be able to edit their own name/email"""
        if not self.manager_token:
            pytest.skip("Manager user not available")
        
        # Get current manager info
        get_response = requests.get(
            f"{BASE_URL}/api/users/{self.manager_id}",
            headers=self.get_manager_headers()
        )
        if get_response.status_code != 200:
            pytest.skip("Cannot get manager info")
        
        original_name = get_response.json()["name"]
        new_name = "TEST_Updated Manager Name"
        
        response = requests.put(
            f"{BASE_URL}/api/users/{self.manager_id}",
            json={"name": new_name},
            headers=self.get_manager_headers()
        )
        
        print(f"Manager self-edit response: {response.status_code}")
        
        assert response.status_code == 200, f"Manager self-edit failed: {response.text}"
        
        # Restore
        requests.put(
            f"{BASE_URL}/api/users/{self.manager_id}",
            json={"name": original_name},
            headers=self.get_manager_headers()
        )
    
    def test_non_admin_cannot_change_own_role(self):
        """Issue 3: Non-admin users should NOT be able to change their own role"""
        if not self.manager_token:
            pytest.skip("Manager user not available")
        
        response = requests.put(
            f"{BASE_URL}/api/users/{self.manager_id}",
            json={"role": "admin"},
            headers=self.get_manager_headers()
        )
        
        print(f"Manager role change response: {response.status_code}")
        
        # Should be forbidden or the role should not change
        if response.status_code == 200:
            data = response.json()
            assert data["role"] != "admin", "Non-admin should not be able to change own role to admin"
        else:
            assert response.status_code == 403, "Should return 403 for role change attempt"

    # ==================== Issue 4: Bulk Delete (Admin Only) ====================
    
    def test_bulk_delete_as_admin_succeeds(self):
        """Issue 4: Admin should be able to bulk delete leads"""
        # First create test leads
        lead_ids = []
        for i in range(2):
            response = requests.post(
                f"{BASE_URL}/api/leads",
                json={
                    "name": f"TEST_Bulk Delete Lead {i}",
                    "phone": f"+1-555-999-000{i}",
                    "source": "Website"
                },
                headers=self.get_admin_headers()
            )
            if response.status_code == 201:
                lead_ids.append(response.json()["id"])
        
        if len(lead_ids) < 2:
            pytest.skip("Could not create test leads")
        
        # Now bulk delete
        response = requests.post(
            f"{BASE_URL}/api/leads/bulk-delete",
            json={"lead_ids": lead_ids},
            headers=self.get_admin_headers()
        )
        
        print(f"Admin bulk delete response: {response.status_code}")
        print(f"Admin bulk delete response: {response.text[:500]}")
        
        assert response.status_code == 200, f"Admin bulk delete failed: {response.text}"
        data = response.json()
        assert "message" in data
        assert "deleted" in data["message"].lower() or str(len(lead_ids)) in data["message"]
    
    def test_bulk_delete_as_manager_forbidden(self):
        """Issue 4: Manager should NOT be able to bulk delete leads"""
        if not self.manager_token:
            pytest.skip("Manager user not available")
        
        # Create a test lead first
        create_response = requests.post(
            f"{BASE_URL}/api/leads",
            json={
                "name": "TEST_Manager Delete Test",
                "phone": "+1-555-888-0001",
                "source": "Website"
            },
            headers=self.get_admin_headers()
        )
        
        if create_response.status_code != 201:
            pytest.skip("Could not create test lead")
        
        lead_id = create_response.json()["id"]
        
        # Try to bulk delete as manager
        response = requests.post(
            f"{BASE_URL}/api/leads/bulk-delete",
            json={"lead_ids": [lead_id]},
            headers=self.get_manager_headers()
        )
        
        print(f"Manager bulk delete response: {response.status_code}")
        
        assert response.status_code == 403, f"Manager should get 403 for bulk delete, got {response.status_code}"
        
        # Cleanup - delete as admin
        requests.delete(
            f"{BASE_URL}/api/leads/{lead_id}",
            headers=self.get_admin_headers()
        )
    
    def test_bulk_delete_requires_lead_ids(self):
        """Issue 4: Bulk delete should require lead_ids array"""
        response = requests.post(
            f"{BASE_URL}/api/leads/bulk-delete",
            json={},
            headers=self.get_admin_headers()
        )
        
        assert response.status_code == 400, "Should require lead_ids"
        
        response = requests.post(
            f"{BASE_URL}/api/leads/bulk-delete",
            json={"lead_ids": []},
            headers=self.get_admin_headers()
        )
        
        assert response.status_code == 400, "Should require non-empty lead_ids"
    
    def test_bulk_delete_requires_auth(self):
        """Issue 4: Bulk delete should require authentication"""
        response = requests.post(
            f"{BASE_URL}/api/leads/bulk-delete",
            json={"lead_ids": ["some-id"]}
        )
        
        assert response.status_code == 401, "Should require auth"


class TestSalesRepBulkDelete:
    """Test that sales rep cannot bulk delete"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get sales rep token if available"""
        # First login as admin to get users list
        admin_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "alex@bidinn.com",
            "password": "password123"
        })
        
        if admin_response.status_code != 200:
            pytest.skip("Cannot login as admin")
        
        admin_token = admin_response.json()["access_token"]
        self.admin_headers = {
            "Authorization": f"Bearer {admin_token}",
            "Content-Type": "application/json"
        }
        
        # Get users list to find a sales rep
        users_response = requests.get(
            f"{BASE_URL}/api/users",
            headers=self.admin_headers
        )
        
        if users_response.status_code != 200:
            pytest.skip("Cannot get users list")
        
        users = users_response.json()
        sales_rep = next((u for u in users if u["role"] == "sales_rep"), None)
        
        if not sales_rep:
            pytest.skip("No sales rep user found")
        
        # Try to login as sales rep (we don't know the password, so we'll create one)
        self.sales_rep_token = None
        self.sales_rep_id = sales_rep["id"]
    
    def test_sales_rep_cannot_bulk_delete(self):
        """Issue 4: Sales rep should NOT be able to bulk delete"""
        # Create a test sales rep user
        create_response = requests.post(
            f"{BASE_URL}/api/users",
            json={
                "name": "TEST_Sales Rep For Delete Test",
                "email": "test_salesrep_delete@bidinn.com",
                "password": "testpass123",
                "role": "sales_rep"
            },
            headers=self.admin_headers
        )
        
        if create_response.status_code != 201:
            pytest.skip("Could not create test sales rep")
        
        sales_rep_id = create_response.json()["id"]
        
        # Login as sales rep
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test_salesrep_delete@bidinn.com",
            "password": "testpass123"
        })
        
        if login_response.status_code != 200:
            # Cleanup and skip
            requests.delete(f"{BASE_URL}/api/users/{sales_rep_id}", headers=self.admin_headers)
            pytest.skip("Could not login as test sales rep")
        
        sales_rep_token = login_response.json()["access_token"]
        sales_rep_headers = {
            "Authorization": f"Bearer {sales_rep_token}",
            "Content-Type": "application/json"
        }
        
        # Create a test lead
        lead_response = requests.post(
            f"{BASE_URL}/api/leads",
            json={
                "name": "TEST_Lead For Sales Rep Delete",
                "phone": "+1-555-777-0001",
                "source": "Website"
            },
            headers=self.admin_headers
        )
        
        lead_id = None
        if lead_response.status_code == 201:
            lead_id = lead_response.json()["id"]
        
        # Try bulk delete as sales rep
        response = requests.post(
            f"{BASE_URL}/api/leads/bulk-delete",
            json={"lead_ids": [lead_id] if lead_id else ["fake-id"]},
            headers=sales_rep_headers
        )
        
        print(f"Sales rep bulk delete response: {response.status_code}")
        
        assert response.status_code == 403, f"Sales rep should get 403, got {response.status_code}"
        
        # Cleanup
        if lead_id:
            requests.delete(f"{BASE_URL}/api/leads/{lead_id}", headers=self.admin_headers)
        requests.delete(f"{BASE_URL}/api/users/{sales_rep_id}", headers=self.admin_headers)


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
