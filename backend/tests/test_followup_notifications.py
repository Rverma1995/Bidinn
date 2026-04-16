"""
Test suite for Follow-up Reminder Notification System
Tests:
1. GET /api/notifications returns followup_upcoming and followup_missed type notifications
2. Notification structure validation (title, message, target_id, target_type)
3. Mark notification as read
4. Mark all notifications as read
5. Notification types and priorities
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://crm-deploy-8.preview.emergentagent.com').rstrip('/')

# Test credentials
ADMIN_EMAIL = "sarah@bidinn.com"
ADMIN_PASSWORD = "password123"
MANAGER_EMAIL = "alex@bidinn.com"
MANAGER_PASSWORD = "password123"


class TestFollowupNotifications:
    """Test follow-up notification system"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
    def get_auth_token(self, email, password):
        """Get authentication token"""
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": email,
            "password": password
        })
        if response.status_code == 200:
            return response.json().get("access_token")
        return None
    
    def test_api_health(self):
        """Test API health endpoint"""
        response = self.session.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        print("PASS: API health check")
    
    def test_admin_login(self):
        """Test admin login"""
        token = self.get_auth_token(ADMIN_EMAIL, ADMIN_PASSWORD)
        assert token is not None, "Admin login failed"
        print(f"PASS: Admin login successful")
    
    def test_notifications_endpoint_returns_data(self):
        """Test GET /api/notifications returns notifications and unread_count"""
        token = self.get_auth_token(ADMIN_EMAIL, ADMIN_PASSWORD)
        assert token is not None
        
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        response = self.session.get(f"{BASE_URL}/api/notifications")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        # Check response structure
        assert "notifications" in data, "Response should have 'notifications' key"
        assert "unread_count" in data, "Response should have 'unread_count' key"
        assert isinstance(data["notifications"], list), "notifications should be a list"
        assert isinstance(data["unread_count"], int), "unread_count should be an integer"
        
        print(f"PASS: Notifications endpoint returns {len(data['notifications'])} notifications, {data['unread_count']} unread")
    
    def test_followup_missed_notification_exists(self):
        """Test that followup_missed type notifications exist for admin"""
        token = self.get_auth_token(ADMIN_EMAIL, ADMIN_PASSWORD)
        assert token is not None
        
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        response = self.session.get(f"{BASE_URL}/api/notifications")
        
        assert response.status_code == 200
        data = response.json()
        
        # Find followup_missed notifications
        followup_missed = [n for n in data["notifications"] if n.get("type") == "followup_missed"]
        
        assert len(followup_missed) > 0, "Should have at least one followup_missed notification"
        
        # Validate notification structure
        notification = followup_missed[0]
        assert "id" in notification, "Notification should have id"
        assert "title" in notification, "Notification should have title"
        assert "message" in notification, "Notification should have message"
        assert "type" in notification, "Notification should have type"
        assert notification["type"] == "followup_missed", "Type should be followup_missed"
        
        # Check title format - should contain "Missed Follow-up"
        assert "Missed Follow-up" in notification["title"], f"Title should contain 'Missed Follow-up', got: {notification['title']}"
        
        print(f"PASS: Found {len(followup_missed)} followup_missed notifications")
        print(f"  Sample title: {notification['title']}")
    
    def test_followup_notification_has_target_id(self):
        """Test that followup notifications have target_id pointing to lead"""
        token = self.get_auth_token(ADMIN_EMAIL, ADMIN_PASSWORD)
        assert token is not None
        
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        response = self.session.get(f"{BASE_URL}/api/notifications")
        
        assert response.status_code == 200
        data = response.json()
        
        # Find followup notifications
        followup_notifications = [n for n in data["notifications"] 
                                  if n.get("type") in ["followup_missed", "followup_upcoming"]]
        
        if len(followup_notifications) > 0:
            notification = followup_notifications[0]
            assert notification.get("target_id") is not None, "Followup notification should have target_id"
            assert notification.get("target_type") == "lead", "Followup notification target_type should be 'lead'"
            print(f"PASS: Followup notification has target_id={notification['target_id']}, target_type={notification['target_type']}")
        else:
            pytest.skip("No followup notifications found to test")
    
    def test_followup_notification_has_metadata(self):
        """Test that followup notifications have metadata with lead details"""
        token = self.get_auth_token(ADMIN_EMAIL, ADMIN_PASSWORD)
        assert token is not None
        
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        response = self.session.get(f"{BASE_URL}/api/notifications")
        
        assert response.status_code == 200
        data = response.json()
        
        # Find followup notifications
        followup_notifications = [n for n in data["notifications"] 
                                  if n.get("type") in ["followup_missed", "followup_upcoming"]]
        
        if len(followup_notifications) > 0:
            notification = followup_notifications[0]
            metadata = notification.get("metadata", {})
            
            assert "lead_name" in metadata, "Metadata should have lead_name"
            assert "lead_phone" in metadata, "Metadata should have lead_phone"
            assert "followup_time" in metadata, "Metadata should have followup_time"
            
            print(f"PASS: Followup notification metadata: lead_name={metadata['lead_name']}, lead_phone={metadata['lead_phone']}")
        else:
            pytest.skip("No followup notifications found to test")
    
    def test_followup_missed_has_high_priority(self):
        """Test that followup_missed notifications have high priority"""
        token = self.get_auth_token(ADMIN_EMAIL, ADMIN_PASSWORD)
        assert token is not None
        
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        response = self.session.get(f"{BASE_URL}/api/notifications")
        
        assert response.status_code == 200
        data = response.json()
        
        # Find followup_missed notifications
        followup_missed = [n for n in data["notifications"] if n.get("type") == "followup_missed"]
        
        if len(followup_missed) > 0:
            notification = followup_missed[0]
            assert notification.get("priority") == "high", f"Followup missed should have high priority, got: {notification.get('priority')}"
            print(f"PASS: Followup missed notification has priority={notification['priority']}")
        else:
            pytest.skip("No followup_missed notifications found to test")
    
    def test_mark_notification_as_read(self):
        """Test marking a notification as read"""
        token = self.get_auth_token(ADMIN_EMAIL, ADMIN_PASSWORD)
        assert token is not None
        
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        # Get notifications
        response = self.session.get(f"{BASE_URL}/api/notifications")
        assert response.status_code == 200
        data = response.json()
        
        if len(data["notifications"]) == 0:
            pytest.skip("No notifications to test mark as read")
        
        # Find an unread notification
        unread = [n for n in data["notifications"] if not n.get("is_read")]
        if len(unread) == 0:
            pytest.skip("No unread notifications to test")
        
        notification_id = unread[0]["id"]
        
        # Mark as read
        response = self.session.put(f"{BASE_URL}/api/notifications/{notification_id}/read")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        result = response.json()
        assert result.get("is_read") == True, "Notification should be marked as read"
        
        print(f"PASS: Notification {notification_id} marked as read")
    
    def test_mark_all_notifications_read(self):
        """Test marking all notifications as read"""
        token = self.get_auth_token(ADMIN_EMAIL, ADMIN_PASSWORD)
        assert token is not None
        
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        # Mark all as read
        response = self.session.put(f"{BASE_URL}/api/notifications/mark-all-read")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        result = response.json()
        assert "message" in result, "Response should have message"
        
        # Verify unread count is 0
        response = self.session.get(f"{BASE_URL}/api/notifications")
        assert response.status_code == 200
        data = response.json()
        assert data["unread_count"] == 0, f"Unread count should be 0 after mark all read, got {data['unread_count']}"
        
        print(f"PASS: All notifications marked as read, unread_count={data['unread_count']}")
    
    def test_manager_gets_followup_notifications(self):
        """Test that manager also gets followup notifications"""
        token = self.get_auth_token(MANAGER_EMAIL, MANAGER_PASSWORD)
        assert token is not None
        
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        response = self.session.get(f"{BASE_URL}/api/notifications")
        
        assert response.status_code == 200
        data = response.json()
        
        # Manager should have notifications
        assert "notifications" in data
        assert "unread_count" in data
        
        # Check for followup notifications
        followup_notifications = [n for n in data["notifications"] 
                                  if n.get("type") in ["followup_missed", "followup_upcoming"]]
        
        print(f"PASS: Manager has {len(data['notifications'])} total notifications, {len(followup_notifications)} followup notifications")
    
    def test_notification_types_enum(self):
        """Test that notification types include followup_upcoming and followup_missed"""
        token = self.get_auth_token(ADMIN_EMAIL, ADMIN_PASSWORD)
        assert token is not None
        
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        response = self.session.get(f"{BASE_URL}/api/notifications")
        
        assert response.status_code == 200
        data = response.json()
        
        # Get all unique notification types
        notification_types = set(n.get("type") for n in data["notifications"])
        
        print(f"Found notification types: {notification_types}")
        
        # Check that followup types are valid
        valid_types = {"idle_lead", "duplicate_lead", "lead_merged", "lead_assignment", 
                       "followup_upcoming", "followup_missed", "system"}
        
        for ntype in notification_types:
            assert ntype in valid_types, f"Unknown notification type: {ntype}"
        
        print(f"PASS: All notification types are valid: {notification_types}")
    
    def test_lead_detail_accessible_from_notification(self):
        """Test that lead detail page is accessible via notification target_id"""
        token = self.get_auth_token(ADMIN_EMAIL, ADMIN_PASSWORD)
        assert token is not None
        
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        response = self.session.get(f"{BASE_URL}/api/notifications")
        
        assert response.status_code == 200
        data = response.json()
        
        # Find a followup notification with target_id
        followup_notifications = [n for n in data["notifications"] 
                                  if n.get("type") in ["followup_missed", "followup_upcoming"] 
                                  and n.get("target_id")]
        
        if len(followup_notifications) == 0:
            pytest.skip("No followup notifications with target_id found")
        
        notification = followup_notifications[0]
        lead_id = notification["target_id"]
        
        # Try to access the lead
        response = self.session.get(f"{BASE_URL}/api/leads/{lead_id}")
        assert response.status_code == 200, f"Lead {lead_id} should be accessible, got {response.status_code}"
        
        lead_data = response.json()
        assert lead_data.get("id") == lead_id, "Lead ID should match"
        
        print(f"PASS: Lead {lead_id} accessible from notification, lead name: {lead_data.get('name')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
