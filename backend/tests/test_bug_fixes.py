"""
Test suite for 5 bug fixes/enhancements:
1. Leads page view should show Name, Phone, Email, Source columns
2. Booking creation works
3. Booking form shows 'Amount Received' field in INR
4. Sales Rep should not see unassigned leads
5. Dashboard alerts should show for all user roles
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_CREDS = {"email": "alex@bidinn.com", "password": "password123"}
SALES_REP_CREDS = {"email": "emily@bidinn.com", "password": "password123"}
MANAGER_CREDS = {"email": "sarah@bidinn.com", "password": "password123"}


@pytest.fixture(scope="module")
def admin_token():
    """Get admin authentication token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN_CREDS)
    assert response.status_code == 200, f"Admin login failed: {response.text}"
    return response.json().get("access_token")


@pytest.fixture(scope="module")
def sales_rep_token():
    """Get sales rep authentication token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json=SALES_REP_CREDS)
    assert response.status_code == 200, f"Sales rep login failed: {response.text}"
    return response.json().get("access_token")


@pytest.fixture(scope="module")
def manager_token():
    """Get manager authentication token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json=MANAGER_CREDS)
    assert response.status_code == 200, f"Manager login failed: {response.text}"
    return response.json().get("access_token")


class TestAPIHealth:
    """Basic API health check"""
    
    def test_api_health(self):
        """Test API is accessible"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200


class TestLeadsTableColumns:
    """Test 1: Leads page should show Name, Phone, Email, Source columns"""
    
    def test_leads_list_returns_required_fields(self, admin_token):
        """Verify leads API returns name, phone, email, source fields"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/leads", headers=headers)
        
        assert response.status_code == 200
        leads = response.json()
        
        if len(leads) > 0:
            lead = leads[0]
            # Check required fields exist
            assert "name" in lead, "Lead should have 'name' field"
            assert "phone" in lead, "Lead should have 'phone' field"
            assert "email" in lead, "Lead should have 'email' field"
            assert "source" in lead, "Lead should have 'source' field"
            print(f"Lead fields verified: name={lead.get('name')}, phone={lead.get('phone')}, email={lead.get('email')}, source={lead.get('source')}")


class TestBookingCreation:
    """Test 2: Booking creation should work"""
    
    def test_get_booking_reasons(self, admin_token):
        """Test booking reasons endpoint"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/bookings/reasons", headers=headers)
        
        assert response.status_code == 200
        reasons = response.json()
        assert isinstance(reasons, list)
        assert len(reasons) > 0
        print(f"Booking reasons: {reasons}")
    
    def test_create_booking_with_lead(self, admin_token):
        """Test creating a booking with a lead"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # First get a lead to use
        leads_response = requests.get(f"{BASE_URL}/api/leads", headers=headers)
        assert leads_response.status_code == 200
        leads = leads_response.json()
        
        if len(leads) == 0:
            pytest.skip("No leads available for booking test")
        
        # Find a lead that's not already won/lost
        eligible_lead = None
        for lead in leads:
            if lead.get('status') not in ['won', 'lost']:
                eligible_lead = lead
                break
        
        if not eligible_lead:
            pytest.skip("No eligible leads for booking (all are won/lost)")
        
        # Create booking
        booking_data = {
            "lead_id": eligible_lead['id'],
            "hotel_name": "Test Hotel for Bug Fix",
            "check_in": "2026-02-15",
            "check_out": "2026-02-18",
            "final_price": 25000,
            "bid_price": 25000,
            "notes": "Test booking for bug fix verification",
            "booking_reason": "Business Trip"
        }
        
        response = requests.post(f"{BASE_URL}/api/bookings", json=booking_data, headers=headers)
        
        assert response.status_code == 201, f"Booking creation failed: {response.text}"
        booking = response.json()
        
        # Verify booking fields
        assert booking.get('id'), "Booking should have an ID"
        assert booking.get('lead_id') == eligible_lead['id']
        assert booking.get('hotel_name') == "Test Hotel for Bug Fix"
        assert booking.get('final_price') == 25000
        print(f"Booking created successfully: ID={booking.get('id')}, Hotel={booking.get('hotel_name')}, Amount={booking.get('final_price')}")
    
    def test_get_bookings_list(self, admin_token):
        """Test getting bookings list"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/bookings", headers=headers)
        
        assert response.status_code == 200
        bookings = response.json()
        assert isinstance(bookings, list)
        
        if len(bookings) > 0:
            booking = bookings[0]
            # Verify booking has final_price field (Amount Received)
            assert "final_price" in booking, "Booking should have 'final_price' field"
            print(f"Bookings count: {len(bookings)}, First booking final_price: {booking.get('final_price')}")


class TestSalesRepLeadFiltering:
    """Test 4: Sales Rep should not see unassigned leads"""
    
    def test_sales_rep_sees_only_assigned_leads(self, sales_rep_token):
        """Sales rep should only see leads assigned to them"""
        headers = {"Authorization": f"Bearer {sales_rep_token}"}
        
        # Get sales rep's user info
        me_response = requests.get(f"{BASE_URL}/api/auth/me", headers=headers)
        assert me_response.status_code == 200
        sales_rep = me_response.json()
        sales_rep_id = sales_rep.get('id')
        print(f"Sales Rep: {sales_rep.get('name')} (ID: {sales_rep_id})")
        
        # Get leads as sales rep
        leads_response = requests.get(f"{BASE_URL}/api/leads", headers=headers)
        assert leads_response.status_code == 200
        leads = leads_response.json()
        
        print(f"Sales rep sees {len(leads)} leads")
        
        # Verify all leads are assigned to this sales rep (or none if no assignments)
        for lead in leads:
            assigned_to = lead.get('assigned_to')
            assert assigned_to == sales_rep_id, f"Sales rep should only see their assigned leads. Found lead assigned to: {assigned_to}"
        
        print(f"PASS: All {len(leads)} leads are correctly assigned to sales rep")
    
    def test_admin_sees_all_leads(self, admin_token):
        """Admin should see all leads including unassigned"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        leads_response = requests.get(f"{BASE_URL}/api/leads", headers=headers)
        assert leads_response.status_code == 200
        leads = leads_response.json()
        
        # Count unassigned leads
        unassigned_count = sum(1 for lead in leads if not lead.get('assigned_to'))
        assigned_count = len(leads) - unassigned_count
        
        print(f"Admin sees {len(leads)} total leads: {assigned_count} assigned, {unassigned_count} unassigned")
        
        # Admin should see more leads than sales rep (or at least unassigned ones)
        assert len(leads) > 0, "Admin should see leads"


class TestDashboardAlerts:
    """Test 5: Dashboard alerts should show for all user roles"""
    
    def test_admin_dashboard_stats(self, admin_token):
        """Admin should see dashboard stats including alerts"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/dashboard/stats", headers=headers)
        
        assert response.status_code == 200
        stats = response.json()
        
        # Verify alert-related fields exist
        assert "uncontacted_over_1hr" in stats, "Stats should include uncontacted_over_1hr"
        assert "overdue_followups" in stats, "Stats should include overdue_followups"
        
        print(f"Admin dashboard stats: uncontacted_over_1hr={stats.get('uncontacted_over_1hr')}, overdue_followups={stats.get('overdue_followups')}")
    
    def test_sales_rep_dashboard_stats(self, sales_rep_token):
        """Sales rep should see dashboard stats including alerts (scoped to their leads)"""
        headers = {"Authorization": f"Bearer {sales_rep_token}"}
        response = requests.get(f"{BASE_URL}/api/dashboard/stats", headers=headers)
        
        assert response.status_code == 200
        stats = response.json()
        
        # Verify alert-related fields exist
        assert "uncontacted_over_1hr" in stats, "Stats should include uncontacted_over_1hr"
        assert "overdue_followups" in stats, "Stats should include overdue_followups"
        
        print(f"Sales rep dashboard stats: uncontacted_over_1hr={stats.get('uncontacted_over_1hr')}, overdue_followups={stats.get('overdue_followups')}")
    
    def test_manager_dashboard_stats(self, manager_token):
        """Manager should see dashboard stats including alerts"""
        headers = {"Authorization": f"Bearer {manager_token}"}
        response = requests.get(f"{BASE_URL}/api/dashboard/stats", headers=headers)
        
        assert response.status_code == 200
        stats = response.json()
        
        # Verify alert-related fields exist
        assert "uncontacted_over_1hr" in stats, "Stats should include uncontacted_over_1hr"
        assert "overdue_followups" in stats, "Stats should include overdue_followups"
        
        print(f"Manager dashboard stats: uncontacted_over_1hr={stats.get('uncontacted_over_1hr')}, overdue_followups={stats.get('overdue_followups')}")
    
    def test_overdue_followups_endpoint(self, admin_token):
        """Test overdue followups endpoint"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/dashboard/overdue-followups", headers=headers)
        
        assert response.status_code == 200
        overdue = response.json()
        assert isinstance(overdue, list)
        print(f"Overdue followups count: {len(overdue)}")


class TestBookingAmountReceived:
    """Test 3: Booking form should show 'Amount Received' field in INR"""
    
    def test_booking_has_final_price_field(self, admin_token):
        """Verify booking API returns final_price (Amount Received)"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/bookings", headers=headers)
        
        assert response.status_code == 200
        bookings = response.json()
        
        if len(bookings) > 0:
            booking = bookings[0]
            # final_price is the "Amount Received" field
            assert "final_price" in booking, "Booking should have 'final_price' field (Amount Received)"
            print(f"Booking final_price (Amount Received): {booking.get('final_price')}")
    
    def test_create_booking_with_amount_received(self, admin_token):
        """Test creating booking with amount received (final_price)"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Get a lead
        leads_response = requests.get(f"{BASE_URL}/api/leads", headers=headers)
        leads = leads_response.json()
        
        eligible_lead = None
        for lead in leads:
            if lead.get('status') not in ['won', 'lost']:
                eligible_lead = lead
                break
        
        if not eligible_lead:
            pytest.skip("No eligible leads for booking test")
        
        # Create booking with amount_received (stored as final_price)
        amount_received = 35000  # INR
        booking_data = {
            "lead_id": eligible_lead['id'],
            "hotel_name": "Amount Received Test Hotel",
            "check_in": "2026-03-01",
            "check_out": "2026-03-05",
            "final_price": amount_received,
            "bid_price": amount_received,  # Same as final_price per new design
            "notes": "Testing Amount Received field"
        }
        
        response = requests.post(f"{BASE_URL}/api/bookings", json=booking_data, headers=headers)
        
        assert response.status_code == 201, f"Booking creation failed: {response.text}"
        booking = response.json()
        
        assert booking.get('final_price') == amount_received, f"Amount Received should be {amount_received}"
        print(f"Booking created with Amount Received: ₹{booking.get('final_price')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
