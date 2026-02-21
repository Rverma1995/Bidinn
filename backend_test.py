#!/usr/bin/env python3
"""
Comprehensive Backend API Testing for Bidinn CRM
Tests all major API endpoints and functionality
"""

import requests
import sys
import json
from datetime import datetime, timedelta
from typing import Dict, Any, Optional

class BidinnAPITester:
    def __init__(self, base_url="https://lead-forge-6.preview.emergentagent.com"):
        self.base_url = base_url
        self.token = None
        self.current_user = None
        self.tests_run = 0
        self.tests_passed = 0
        self.failed_tests = []
        self.test_data = {}

    def log_result(self, test_name: str, success: bool, details: str = ""):
        """Log test result"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
            print(f"✅ {test_name}")
        else:
            self.failed_tests.append({"test": test_name, "details": details})
            print(f"❌ {test_name} - {details}")

    def make_request(self, method: str, endpoint: str, data: Any = None, expected_status: int = 200) -> tuple[bool, Dict]:
        """Make API request with error handling"""
        url = f"{self.base_url}/api/{endpoint}"
        headers = {'Content-Type': 'application/json'}
        if self.token:
            headers['Authorization'] = f'Bearer {self.token}'

        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, timeout=10)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers, timeout=10)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=headers, timeout=10)
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers, timeout=10)
            else:
                return False, {"error": f"Unsupported method: {method}"}

            success = response.status_code == expected_status
            try:
                response_data = response.json()
            except:
                response_data = {"status_code": response.status_code, "text": response.text}

            return success, response_data

        except requests.exceptions.RequestException as e:
            return False, {"error": str(e)}

    def test_health_check(self):
        """Test basic API health"""
        success, response = self.make_request('GET', '')
        self.log_result("API Health Check", success and "Bidinn CRM API" in str(response))

    def test_login_demo_accounts(self):
        """Test login with all demo accounts"""
        demo_accounts = [
            {"email": "alex@bidinn.com", "password": "password123", "role": "admin"},
            {"email": "sarah@bidinn.com", "password": "password123", "role": "manager"},
            {"email": "michael@bidinn.com", "password": "password123", "role": "team_lead"},
            {"email": "emily@bidinn.com", "password": "password123", "role": "sales_rep"},
        ]

        for account in demo_accounts:
            success, response = self.make_request('POST', 'auth/login', {
                "email": account["email"],
                "password": account["password"]
            })
            
            if success and 'access_token' in response:
                # Store admin token for further tests
                if account["role"] == "admin":
                    self.token = response['access_token']
                    self.current_user = response['user']
                    self.test_data['admin_user_id'] = response['user']['id']
                self.log_result(f"Login {account['role']}", True)
            else:
                self.log_result(f"Login {account['role']}", False, str(response))

    def test_auth_me(self):
        """Test getting current user info"""
        if not self.token:
            self.log_result("Auth Me", False, "No token available")
            return
        
        success, response = self.make_request('GET', 'auth/me')
        self.log_result("Auth Me", success and 'email' in response)

    def test_dashboard_stats(self):
        """Test dashboard statistics endpoint"""
        success, response = self.make_request('GET', 'dashboard/stats')
        expected_fields = ['total_leads', 'new_leads', 'contacted_leads', 'total_revenue']
        has_fields = all(field in response for field in expected_fields)
        self.log_result("Dashboard Stats", success and has_fields)

    def test_dashboard_leaderboard(self):
        """Test leaderboard endpoint"""
        success, response = self.make_request('GET', 'dashboard/leaderboard')
        is_list = isinstance(response, list)
        self.log_result("Dashboard Leaderboard", success and is_list)

    def test_dashboard_charts(self):
        """Test dashboard chart endpoints"""
        endpoints = [
            'dashboard/revenue-trend',
            'dashboard/pipeline-stats',
            'dashboard/source-performance'
        ]
        
        for endpoint in endpoints:
            success, response = self.make_request('GET', endpoint)
            self.log_result(f"Dashboard {endpoint.split('/')[-1]}", success)

    def test_leads_crud(self):
        """Test leads CRUD operations"""
        # Create lead
        lead_data = {
            "name": "Test Company Ltd",
            "phone": "+1-555-TEST-001",
            "email": "test@testcompany.com",
            "source": "Website",
            "city": "Test City",
            "notes": "Test lead for API testing"
        }
        
        success, response = self.make_request('POST', 'leads', lead_data, 200)
        if success and 'id' in response:
            lead_id = response['id']
            self.test_data['test_lead_id'] = lead_id
            self.log_result("Create Lead", True)
            
            # Get lead
            success, response = self.make_request('GET', f'leads/{lead_id}')
            self.log_result("Get Lead", success and response.get('name') == lead_data['name'])
            
            # Update lead
            update_data = {"status": "contacted", "notes": "Updated notes"}
            success, response = self.make_request('PUT', f'leads/{lead_id}', update_data)
            self.log_result("Update Lead", success and response.get('status') == 'contacted')
            
            # Get all leads
            success, response = self.make_request('GET', 'leads')
            is_list = isinstance(response, list)
            self.log_result("Get All Leads", success and is_list)
            
        else:
            self.log_result("Create Lead", False, str(response))

    def test_users_endpoints(self):
        """Test user management endpoints"""
        # Get all users
        success, response = self.make_request('GET', 'users')
        is_list = isinstance(response, list)
        self.log_result("Get All Users", success and is_list)
        
        if success and response:
            # Get specific user
            user_id = response[0]['id']
            success, response = self.make_request('GET', f'users/{user_id}')
            self.log_result("Get Specific User", success and 'email' in response)

    def test_call_logging(self):
        """Test call logging functionality"""
        if 'test_lead_id' not in self.test_data:
            self.log_result("Call Logging", False, "No test lead available")
            return
        
        call_data = {
            "lead_id": self.test_data['test_lead_id'],
            "outcome": "connected",
            "duration_minutes": 15,
            "notes": "Good conversation, interested in services"
        }
        
        success, response = self.make_request('POST', 'calls', call_data, 200)
        if success and 'id' in response:
            self.test_data['test_call_id'] = response['id']
            self.log_result("Log Call", True)
            
            # Get calls
            success, response = self.make_request('GET', 'calls')
            is_list = isinstance(response, list)
            self.log_result("Get Calls", success and is_list)
        else:
            self.log_result("Log Call", False, str(response))

    def test_bookings_crud(self):
        """Test bookings CRUD operations"""
        if 'test_lead_id' not in self.test_data:
            self.log_result("Bookings CRUD", False, "No test lead available")
            return
        
        booking_data = {
            "lead_id": self.test_data['test_lead_id'],
            "hotel_name": "Test Hotel",
            "check_in": (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d"),
            "check_out": (datetime.now() + timedelta(days=33)).strftime("%Y-%m-%d"),
            "final_price": 5000.0,
            "bid_price": 4500.0,
            "notes": "Test booking"
        }
        
        success, response = self.make_request('POST', 'bookings', booking_data, 200)
        if success and 'id' in response:
            booking_id = response['id']
            self.test_data['test_booking_id'] = booking_id
            self.log_result("Create Booking", True)
            
            # Get booking
            success, response = self.make_request('GET', f'bookings/{booking_id}')
            self.log_result("Get Booking", success and response.get('hotel_name') == booking_data['hotel_name'])
            
            # Get all bookings
            success, response = self.make_request('GET', 'bookings')
            is_list = isinstance(response, list)
            self.log_result("Get All Bookings", success and is_list)
        else:
            self.log_result("Create Booking", False, str(response))

    def test_payments(self):
        """Test payment recording"""
        if 'test_booking_id' not in self.test_data:
            self.log_result("Payment Recording", False, "No test booking available")
            return
        
        payment_data = {
            "booking_id": self.test_data['test_booking_id'],
            "amount": 2500.0,
            "notes": "Partial payment received"
        }
        
        success, response = self.make_request('POST', 'payments', payment_data, 200)
        if success and 'id' in response:
            self.log_result("Record Payment", True)
            
            # Get payments
            success, response = self.make_request('GET', 'payments')
            is_list = isinstance(response, list)
            self.log_result("Get Payments", success and is_list)
        else:
            self.log_result("Record Payment", False, str(response))

    def test_activities_and_notifications(self):
        """Test activities and notifications"""
        # Get activities
        success, response = self.make_request('GET', 'activities')
        is_list = isinstance(response, list)
        self.log_result("Get Activities", success and is_list)
        
        # Get notifications
        success, response = self.make_request('GET', 'notifications')
        is_list = isinstance(response, list)
        self.log_result("Get Notifications", success and is_list)

    def test_admin_endpoints(self):
        """Test admin-only endpoints"""
        # Test seed data endpoint
        success, response = self.make_request('POST', 'admin/seed-data')
        self.log_result("Admin Seed Data", success)
        
        # Test auto-reset endpoint
        success, response = self.make_request('POST', 'admin/run-auto-reset')
        self.log_result("Admin Auto Reset", success)

    def test_feature_flags(self):
        """Test feature flags endpoint"""
        success, response = self.make_request('GET', 'config/features')
        has_telephony = 'telephony_enabled' in response
        self.log_result("Feature Flags", success and has_telephony)

    def test_role_based_access(self):
        """Test role-based access control"""
        # Test with sales rep account
        success, response = self.make_request('POST', 'auth/login', {
            "email": "emily@bidinn.com",
            "password": "password123"
        })
        
        if success and 'access_token' in response:
            sales_rep_token = response['access_token']
            
            # Temporarily switch to sales rep token
            original_token = self.token
            self.token = sales_rep_token
            
            # Try to access admin endpoint (should fail)
            success, response = self.make_request('POST', 'admin/seed-data', expected_status=403)
            self.log_result("Role Access Control", success)  # Success means 403 was returned as expected
            
            # Restore admin token
            self.token = original_token
        else:
            self.log_result("Role Access Control", False, "Could not login as sales rep")

    def run_all_tests(self):
        """Run comprehensive test suite"""
        print("🚀 Starting Bidinn CRM API Tests")
        print("=" * 50)
        
        # Basic connectivity
        self.test_health_check()
        
        # Authentication
        self.test_login_demo_accounts()
        self.test_auth_me()
        
        # Dashboard
        self.test_dashboard_stats()
        self.test_dashboard_leaderboard()
        self.test_dashboard_charts()
        
        # Core functionality
        self.test_leads_crud()
        self.test_users_endpoints()
        self.test_call_logging()
        self.test_bookings_crud()
        self.test_payments()
        
        # Additional features
        self.test_activities_and_notifications()
        self.test_feature_flags()
        
        # Admin features
        self.test_admin_endpoints()
        
        # Security
        self.test_role_based_access()
        
        # Print summary
        print("\n" + "=" * 50)
        print(f"📊 Test Results: {self.tests_passed}/{self.tests_run} passed")
        
        if self.failed_tests:
            print("\n❌ Failed Tests:")
            for failure in self.failed_tests:
                print(f"  - {failure['test']}: {failure['details']}")
        
        success_rate = (self.tests_passed / self.tests_run * 100) if self.tests_run > 0 else 0
        print(f"\n✨ Success Rate: {success_rate:.1f}%")
        
        return self.tests_passed == self.tests_run

def main():
    """Main test execution"""
    tester = BidinnAPITester()
    success = tester.run_all_tests()
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())