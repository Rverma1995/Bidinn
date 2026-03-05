"""
Test cases for:
1. Currency formatting (INR) - Frontend only, tested via UI
2. Edit User API endpoint (PUT /api/users/:id)
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "alex@bidinn.com"
ADMIN_PASSWORD = "password123"
MANAGER_EMAIL = "sarah@bidinn.com"
MANAGER_PASSWORD = "password123"
SALES_REP_EMAIL = "emily@bidinn.com"
SALES_REP_PASSWORD = "password123"


class TestEditUserAPI:
    """Test Edit User API endpoint (PUT /api/users/:id)"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
    
    def login(self, email, password):
        """Login and get token"""
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": email,
            "password": password
        })
        if response.status_code == 200:
            token = response.json().get("token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
            return response.json()
        return None
    
    def test_get_users_list(self):
        """Test GET /api/users returns list of users"""
        login_data = self.login(ADMIN_EMAIL, ADMIN_PASSWORD)
        assert login_data is not None, "Admin login failed"
        
        response = self.session.get(f"{BASE_URL}/api/users")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        users = response.json()
        assert isinstance(users, list), "Expected list of users"
        assert len(users) > 0, "Expected at least one user"
        
        # Check user structure
        user = users[0]
        assert "id" in user, "User should have id"
        assert "name" in user, "User should have name"
        assert "email" in user, "User should have email"
        assert "role" in user, "User should have role"
        print(f"Found {len(users)} users")
    
    def test_edit_user_name_as_admin(self):
        """Test Admin can edit user name via PUT /api/users/:id"""
        login_data = self.login(ADMIN_EMAIL, ADMIN_PASSWORD)
        assert login_data is not None, "Admin login failed"
        
        # Get list of users
        response = self.session.get(f"{BASE_URL}/api/users")
        users = response.json()
        
        # Find a user that is not the current admin
        target_user = None
        for user in users:
            if user["email"] != ADMIN_EMAIL:
                target_user = user
                break
        
        assert target_user is not None, "No other user found to edit"
        
        original_name = target_user["name"]
        test_name = f"TEST_{original_name}"
        
        # Update user name
        response = self.session.put(f"{BASE_URL}/api/users/{target_user['id']}", json={
            "name": test_name
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        updated_user = response.json()
        assert updated_user["name"] == test_name, f"Name not updated. Expected {test_name}, got {updated_user['name']}"
        print(f"Successfully updated user name from '{original_name}' to '{test_name}'")
        
        # Revert the change
        response = self.session.put(f"{BASE_URL}/api/users/{target_user['id']}", json={
            "name": original_name
        })
        assert response.status_code == 200, "Failed to revert name change"
        print(f"Reverted user name back to '{original_name}'")
    
    def test_edit_user_email_as_admin(self):
        """Test Admin can edit user email via PUT /api/users/:id"""
        login_data = self.login(ADMIN_EMAIL, ADMIN_PASSWORD)
        assert login_data is not None, "Admin login failed"
        
        # Get list of users
        response = self.session.get(f"{BASE_URL}/api/users")
        users = response.json()
        
        # Find a user that is not the current admin
        target_user = None
        for user in users:
            if user["email"] != ADMIN_EMAIL and "test" not in user["email"].lower():
                target_user = user
                break
        
        assert target_user is not None, "No other user found to edit"
        
        original_email = target_user["email"]
        test_email = f"test_{original_email}"
        
        # Update user email
        response = self.session.put(f"{BASE_URL}/api/users/{target_user['id']}", json={
            "email": test_email
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        updated_user = response.json()
        assert updated_user["email"] == test_email, f"Email not updated. Expected {test_email}, got {updated_user['email']}"
        print(f"Successfully updated user email from '{original_email}' to '{test_email}'")
        
        # Revert the change
        response = self.session.put(f"{BASE_URL}/api/users/{target_user['id']}", json={
            "email": original_email
        })
        assert response.status_code == 200, "Failed to revert email change"
        print(f"Reverted user email back to '{original_email}'")
    
    def test_edit_user_name_and_email_together(self):
        """Test Admin can edit both name and email in single request"""
        login_data = self.login(ADMIN_EMAIL, ADMIN_PASSWORD)
        assert login_data is not None, "Admin login failed"
        
        # Get list of users
        response = self.session.get(f"{BASE_URL}/api/users")
        users = response.json()
        
        # Find a user that is not the current admin
        target_user = None
        for user in users:
            if user["email"] != ADMIN_EMAIL:
                target_user = user
                break
        
        assert target_user is not None, "No other user found to edit"
        
        original_name = target_user["name"]
        original_email = target_user["email"]
        test_name = f"TEST_{original_name}"
        test_email = f"test_{original_email}"
        
        # Update both name and email
        response = self.session.put(f"{BASE_URL}/api/users/{target_user['id']}", json={
            "name": test_name,
            "email": test_email
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        updated_user = response.json()
        assert updated_user["name"] == test_name, f"Name not updated"
        assert updated_user["email"] == test_email, f"Email not updated"
        print(f"Successfully updated both name and email")
        
        # Verify with GET
        response = self.session.get(f"{BASE_URL}/api/users/{target_user['id']}")
        assert response.status_code == 200
        fetched_user = response.json()
        assert fetched_user["name"] == test_name, "Name not persisted"
        assert fetched_user["email"] == test_email, "Email not persisted"
        print("Verified changes persisted in database")
        
        # Revert the changes
        response = self.session.put(f"{BASE_URL}/api/users/{target_user['id']}", json={
            "name": original_name,
            "email": original_email
        })
        assert response.status_code == 200, "Failed to revert changes"
        print(f"Reverted user back to original values")
    
    def test_edit_user_as_manager(self):
        """Test Manager can edit user details"""
        login_data = self.login(MANAGER_EMAIL, MANAGER_PASSWORD)
        assert login_data is not None, "Manager login failed"
        
        # Get list of users
        response = self.session.get(f"{BASE_URL}/api/users")
        users = response.json()
        
        # Find a sales rep to edit
        target_user = None
        for user in users:
            if user["role"] == "sales_rep":
                target_user = user
                break
        
        assert target_user is not None, "No sales rep found to edit"
        
        original_name = target_user["name"]
        test_name = f"TEST_MGR_{original_name}"
        
        # Update user name as manager
        response = self.session.put(f"{BASE_URL}/api/users/{target_user['id']}", json={
            "name": test_name
        })
        assert response.status_code == 200, f"Manager should be able to edit users. Got {response.status_code}: {response.text}"
        
        updated_user = response.json()
        assert updated_user["name"] == test_name, "Name not updated by manager"
        print(f"Manager successfully updated user name")
        
        # Revert the change
        response = self.session.put(f"{BASE_URL}/api/users/{target_user['id']}", json={
            "name": original_name
        })
        assert response.status_code == 200, "Failed to revert name change"
    
    def test_edit_user_as_sales_rep_forbidden(self):
        """Test Sales Rep cannot edit user details (should be forbidden)"""
        login_data = self.login(SALES_REP_EMAIL, SALES_REP_PASSWORD)
        assert login_data is not None, "Sales Rep login failed"
        
        # Get list of users
        response = self.session.get(f"{BASE_URL}/api/users")
        users = response.json()
        
        # Find another user to try to edit
        target_user = None
        for user in users:
            if user["email"] != SALES_REP_EMAIL:
                target_user = user
                break
        
        assert target_user is not None, "No other user found"
        
        # Try to update user name as sales rep (should fail)
        response = self.session.put(f"{BASE_URL}/api/users/{target_user['id']}", json={
            "name": "Unauthorized Change"
        })
        assert response.status_code == 403, f"Sales Rep should not be able to edit users. Got {response.status_code}"
        print("Sales Rep correctly forbidden from editing users")
    
    def test_edit_nonexistent_user(self):
        """Test editing non-existent user returns 404"""
        login_data = self.login(ADMIN_EMAIL, ADMIN_PASSWORD)
        assert login_data is not None, "Admin login failed"
        
        # Try to update non-existent user
        response = self.session.put(f"{BASE_URL}/api/users/nonexistent-id-12345", json={
            "name": "Test Name"
        })
        # Should return 404 or similar error
        assert response.status_code in [404, 400, 500], f"Expected error for non-existent user, got {response.status_code}"
        print(f"Correctly returned error for non-existent user: {response.status_code}")
    
    def test_edit_user_empty_fields(self):
        """Test editing user with no valid fields returns error"""
        login_data = self.login(ADMIN_EMAIL, ADMIN_PASSWORD)
        assert login_data is not None, "Admin login failed"
        
        # Get list of users
        response = self.session.get(f"{BASE_URL}/api/users")
        users = response.json()
        target_user = users[0]
        
        # Try to update with empty body
        response = self.session.put(f"{BASE_URL}/api/users/{target_user['id']}", json={})
        assert response.status_code == 400, f"Expected 400 for empty update, got {response.status_code}"
        print("Correctly returned 400 for empty update request")


class TestHealthCheck:
    """Basic health check tests"""
    
    def test_api_health(self):
        """Test API health endpoint"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200, f"Health check failed: {response.status_code}"
        data = response.json()
        assert data.get("status") == "healthy", "API not healthy"
        print("API health check passed")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
