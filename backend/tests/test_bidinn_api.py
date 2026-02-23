"""
Bidinn CRM API Tests - Express.js/TypeScript/MySQL Backend
Tests authentication, leads, dashboard, bookings, users, and calls endpoints
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "alex@bidinn.com"
MANAGER_EMAIL = "sarah@bidinn.com"
SALES_REP_EMAIL = "emily@bidinn.com"
PASSWORD = "password123"


class TestHealthCheck:
    """Health check endpoint tests"""
    
    def test_health_endpoint(self):
        """Test API health check"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert data["database"] == "connected"
        print("✓ Health check passed - database connected")

    def test_api_root(self):
        """Test API root endpoint"""
        response = requests.get(f"{BASE_URL}/api/")
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        assert "Bidinn" in data["message"]
        print("✓ API root endpoint working")


class TestAuthentication:
    """Authentication endpoint tests"""
    
    def test_login_admin_success(self):
        """Test admin login with valid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert "user" in data
        assert data["user"]["email"] == ADMIN_EMAIL
        assert data["user"]["role"] == "admin"
        print(f"✓ Admin login successful: {data['user']['name']}")
    
    def test_login_manager_success(self):
        """Test manager login with valid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": MANAGER_EMAIL,
            "password": PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["user"]["role"] == "manager"
        print(f"✓ Manager login successful: {data['user']['name']}")
    
    def test_login_sales_rep_success(self):
        """Test sales rep login with valid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": SALES_REP_EMAIL,
            "password": PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["user"]["role"] == "sales_rep"
        print(f"✓ Sales rep login successful: {data['user']['name']}")
    
    def test_login_invalid_credentials(self):
        """Test login with invalid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "wrong@example.com",
            "password": "wrongpassword"
        })
        assert response.status_code == 401
        data = response.json()
        assert "detail" in data
        print("✓ Invalid credentials rejected correctly")
    
    def test_get_current_user(self):
        """Test getting current user info"""
        # First login
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": PASSWORD
        })
        token = login_response.json()["access_token"]
        
        # Get current user
        response = requests.get(f"{BASE_URL}/api/auth/me", headers={
            "Authorization": f"Bearer {token}"
        })
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == ADMIN_EMAIL
        print(f"✓ Current user retrieved: {data['name']}")
    
    def test_register_new_user(self):
        """Test user registration"""
        test_email = f"TEST_user_{int(time.time())}@bidinn.com"
        response = requests.post(f"{BASE_URL}/api/auth/register", json={
            "email": test_email,
            "name": "Test User",
            "password": "testpass123",
            "role": "sales_rep"
        })
        assert response.status_code == 201
        data = response.json()
        assert data["email"] == test_email
        assert data["name"] == "Test User"
        print(f"✓ User registration successful: {test_email}")
    
    def test_register_duplicate_email(self):
        """Test registration with existing email"""
        response = requests.post(f"{BASE_URL}/api/auth/register", json={
            "email": ADMIN_EMAIL,
            "name": "Duplicate User",
            "password": "testpass123"
        })
        assert response.status_code == 400
        print("✓ Duplicate email registration rejected")


class TestDashboard:
    """Dashboard endpoint tests"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": PASSWORD
        })
        return response.json()["access_token"]
    
    def test_dashboard_stats(self, auth_token):
        """Test dashboard stats endpoint"""
        response = requests.get(f"{BASE_URL}/api/dashboard/stats", headers={
            "Authorization": f"Bearer {auth_token}"
        })
        assert response.status_code == 200
        data = response.json()
        
        # Verify all expected fields
        expected_fields = [
            "total_leads", "new_leads", "contacted_leads", "qualified_leads",
            "closed_won", "closed_lost", "overdue_followups", "uncontacted_over_1hr",
            "total_revenue", "monthly_revenue", "conversion_rate", "avg_deal_size"
        ]
        for field in expected_fields:
            assert field in data, f"Missing field: {field}"
        
        print(f"✓ Dashboard stats: {data['total_leads']} leads, ${data['total_revenue']} revenue")
    
    def test_leaderboard(self, auth_token):
        """Test leaderboard endpoint"""
        response = requests.get(f"{BASE_URL}/api/dashboard/leaderboard", headers={
            "Authorization": f"Bearer {auth_token}"
        })
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        if len(data) > 0:
            assert "user_name" in data[0]
            assert "revenue" in data[0]
            assert "leads_closed" in data[0]
        print(f"✓ Leaderboard retrieved: {len(data)} users")
    
    def test_pipeline_stats(self, auth_token):
        """Test pipeline stats endpoint"""
        response = requests.get(f"{BASE_URL}/api/dashboard/pipeline-stats", headers={
            "Authorization": f"Bearer {auth_token}"
        })
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, dict)
        print(f"✓ Pipeline stats: {data}")
    
    def test_revenue_trend(self, auth_token):
        """Test revenue trend endpoint"""
        response = requests.get(f"{BASE_URL}/api/dashboard/revenue-trend", headers={
            "Authorization": f"Bearer {auth_token}"
        })
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        if len(data) > 0:
            assert "month" in data[0]
            assert "revenue" in data[0]
        print(f"✓ Revenue trend: {len(data)} months")
    
    def test_source_performance(self, auth_token):
        """Test source performance endpoint"""
        response = requests.get(f"{BASE_URL}/api/dashboard/source-performance", headers={
            "Authorization": f"Bearer {auth_token}"
        })
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        if len(data) > 0:
            assert "source" in data[0]
            assert "total_leads" in data[0]
        print(f"✓ Source performance: {len(data)} sources")


class TestLeads:
    """Leads endpoint tests"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": PASSWORD
        })
        return response.json()["access_token"]
    
    def test_get_leads(self, auth_token):
        """Test getting all leads"""
        response = requests.get(f"{BASE_URL}/api/leads", headers={
            "Authorization": f"Bearer {auth_token}"
        })
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        if len(data) > 0:
            lead = data[0]
            assert "id" in lead
            assert "name" in lead
            assert "phone" in lead
            assert "status" in lead
        print(f"✓ Retrieved {len(data)} leads")
    
    def test_filter_leads_by_status(self, auth_token):
        """Test filtering leads by status"""
        response = requests.get(f"{BASE_URL}/api/leads?status=new", headers={
            "Authorization": f"Bearer {auth_token}"
        })
        assert response.status_code == 200
        data = response.json()
        for lead in data:
            assert lead["status"] == "new"
        print(f"✓ Filtered leads by status: {len(data)} new leads")
    
    def test_filter_leads_by_source(self, auth_token):
        """Test filtering leads by source"""
        response = requests.get(f"{BASE_URL}/api/leads?source=Website", headers={
            "Authorization": f"Bearer {auth_token}"
        })
        assert response.status_code == 200
        data = response.json()
        for lead in data:
            assert lead["source"] == "Website"
        print(f"✓ Filtered leads by source: {len(data)} Website leads")
    
    def test_search_leads(self, auth_token):
        """Test searching leads"""
        response = requests.get(f"{BASE_URL}/api/leads?search=Acme", headers={
            "Authorization": f"Bearer {auth_token}"
        })
        assert response.status_code == 200
        data = response.json()
        print(f"✓ Search results: {len(data)} leads matching 'Acme'")
    
    def test_create_lead(self, auth_token):
        """Test creating a new lead"""
        lead_data = {
            "name": f"TEST_Lead_{int(time.time())}",
            "phone": f"+1-555-{int(time.time()) % 10000:04d}",
            "email": f"test_{int(time.time())}@example.com",
            "source": "Website",
            "campaign": "Test Campaign",
            "city": "New York",
            "notes": "Test lead created by automated tests"
        }
        response = requests.post(f"{BASE_URL}/api/leads", json=lead_data, headers={
            "Authorization": f"Bearer {auth_token}"
        })
        assert response.status_code == 201
        data = response.json()
        assert data["name"] == lead_data["name"]
        assert data["phone"] == lead_data["phone"]
        assert data["status"] == "new"
        print(f"✓ Created lead: {data['name']} (ID: {data['id']})")
        return data["id"]
    
    def test_get_lead_by_id(self, auth_token):
        """Test getting a specific lead"""
        # First get all leads
        leads_response = requests.get(f"{BASE_URL}/api/leads", headers={
            "Authorization": f"Bearer {auth_token}"
        })
        leads = leads_response.json()
        if len(leads) > 0:
            lead_id = leads[0]["id"]
            response = requests.get(f"{BASE_URL}/api/leads/{lead_id}", headers={
                "Authorization": f"Bearer {auth_token}"
            })
            assert response.status_code == 200
            data = response.json()
            assert data["id"] == lead_id
            print(f"✓ Retrieved lead by ID: {data['name']}")
    
    def test_update_lead_status(self, auth_token):
        """Test updating lead status"""
        # Get a lead to update
        leads_response = requests.get(f"{BASE_URL}/api/leads?status=new", headers={
            "Authorization": f"Bearer {auth_token}"
        })
        leads = leads_response.json()
        if len(leads) > 0:
            lead_id = leads[0]["id"]
            response = requests.put(f"{BASE_URL}/api/leads/{lead_id}", json={
                "status": "interested"
            }, headers={
                "Authorization": f"Bearer {auth_token}"
            })
            assert response.status_code == 200
            data = response.json()
            assert data["status"] == "interested"
            print(f"✓ Updated lead status to 'interested'")
            
            # Revert status
            requests.put(f"{BASE_URL}/api/leads/{lead_id}", json={
                "status": "new"
            }, headers={
                "Authorization": f"Bearer {auth_token}"
            })
    
    def test_log_call_for_lead(self, auth_token):
        """Test logging a call for a lead"""
        # Get a lead
        leads_response = requests.get(f"{BASE_URL}/api/leads", headers={
            "Authorization": f"Bearer {auth_token}"
        })
        leads = leads_response.json()
        if len(leads) > 0:
            lead_id = leads[0]["id"]
            response = requests.post(f"{BASE_URL}/api/leads/{lead_id}/log_call", json={
                "outcome": "connected",
                "duration_minutes": 5,
                "notes": "Test call logged by automated tests"
            }, headers={
                "Authorization": f"Bearer {auth_token}"
            })
            assert response.status_code == 201
            data = response.json()
            assert data["outcome"] == "connected"
            assert data["duration_minutes"] == 5
            print(f"✓ Logged call for lead: {data['id']}")
    
    def test_get_import_template(self, auth_token):
        """Test getting import template"""
        response = requests.get(f"{BASE_URL}/api/leads/import/template", headers={
            "Authorization": f"Bearer {auth_token}"
        })
        assert response.status_code == 200
        data = response.json()
        assert "required_columns" in data
        assert "optional_columns" in data
        print(f"✓ Import template retrieved")


class TestUsers:
    """Users endpoint tests"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": PASSWORD
        })
        return response.json()["access_token"]
    
    def test_get_all_users(self, auth_token):
        """Test getting all users"""
        response = requests.get(f"{BASE_URL}/api/users", headers={
            "Authorization": f"Bearer {auth_token}"
        })
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) > 0
        user = data[0]
        assert "id" in user
        assert "email" in user
        assert "name" in user
        assert "role" in user
        print(f"✓ Retrieved {len(data)} users")
    
    def test_get_user_by_id(self, auth_token):
        """Test getting a specific user"""
        # First get all users
        users_response = requests.get(f"{BASE_URL}/api/users", headers={
            "Authorization": f"Bearer {auth_token}"
        })
        users = users_response.json()
        if len(users) > 0:
            user_id = users[0]["id"]
            response = requests.get(f"{BASE_URL}/api/users/{user_id}", headers={
                "Authorization": f"Bearer {auth_token}"
            })
            assert response.status_code == 200
            data = response.json()
            assert data["id"] == user_id
            print(f"✓ Retrieved user by ID: {data['name']}")


class TestBookings:
    """Bookings endpoint tests"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": PASSWORD
        })
        return response.json()["access_token"]
    
    def test_get_bookings(self, auth_token):
        """Test getting all bookings"""
        response = requests.get(f"{BASE_URL}/api/bookings", headers={
            "Authorization": f"Bearer {auth_token}"
        })
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        if len(data) > 0:
            booking = data[0]
            assert "id" in booking
            assert "hotel_name" in booking
            assert "final_price" in booking
        print(f"✓ Retrieved {len(data)} bookings")
    
    def test_get_booking_by_id(self, auth_token):
        """Test getting a specific booking"""
        # First get all bookings
        bookings_response = requests.get(f"{BASE_URL}/api/bookings", headers={
            "Authorization": f"Bearer {auth_token}"
        })
        bookings = bookings_response.json()
        if len(bookings) > 0:
            booking_id = bookings[0]["id"]
            response = requests.get(f"{BASE_URL}/api/bookings/{booking_id}", headers={
                "Authorization": f"Bearer {auth_token}"
            })
            assert response.status_code == 200
            data = response.json()
            assert data["id"] == booking_id
            print(f"✓ Retrieved booking by ID: {data['hotel_name']}")


class TestCalls:
    """Calls endpoint tests"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": PASSWORD
        })
        return response.json()["access_token"]
    
    def test_get_calls(self, auth_token):
        """Test getting all calls"""
        response = requests.get(f"{BASE_URL}/api/calls", headers={
            "Authorization": f"Bearer {auth_token}"
        })
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        if len(data) > 0:
            call = data[0]
            assert "id" in call
            assert "outcome" in call
            assert "duration_minutes" in call
        print(f"✓ Retrieved {len(data)} calls")


class TestAdmin:
    """Admin endpoint tests"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": PASSWORD
        })
        return response.json()["access_token"]
    
    def test_get_features(self, auth_token):
        """Test getting feature flags"""
        response = requests.get(f"{BASE_URL}/api/admin/features", headers={
            "Authorization": f"Bearer {auth_token}"
        })
        assert response.status_code == 200
        data = response.json()
        assert "telephony_enabled" in data
        print(f"✓ Feature flags retrieved: telephony_enabled={data['telephony_enabled']}")


class TestRoleBasedAccess:
    """Role-based access control tests"""
    
    def test_sales_rep_cannot_delete_lead(self):
        """Test that sales rep cannot delete leads"""
        # Login as sales rep
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": SALES_REP_EMAIL,
            "password": PASSWORD
        })
        token = login_response.json()["access_token"]
        
        # Get a lead
        leads_response = requests.get(f"{BASE_URL}/api/leads", headers={
            "Authorization": f"Bearer {token}"
        })
        leads = leads_response.json()
        if len(leads) > 0:
            lead_id = leads[0]["id"]
            response = requests.delete(f"{BASE_URL}/api/leads/{lead_id}", headers={
                "Authorization": f"Bearer {token}"
            })
            # Should be forbidden (403) for sales rep
            assert response.status_code == 403
            print("✓ Sales rep correctly denied lead deletion")
    
    def test_admin_can_access_seed_data(self):
        """Test that admin can access seed data endpoint"""
        # Login as admin
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": PASSWORD
        })
        token = login_response.json()["access_token"]
        
        response = requests.post(f"{BASE_URL}/api/admin/seed-data", headers={
            "Authorization": f"Bearer {token}"
        })
        # Should succeed (200) or say data already seeded
        assert response.status_code == 200
        print("✓ Admin can access seed data endpoint")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
