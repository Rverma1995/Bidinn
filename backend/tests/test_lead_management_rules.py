"""
Test suite for 5 new lead management rules:
1. Lead Assignment Enforcement - leads in certain stages must have an assigned salesperson
2. Closed Lead Reason Capture - require reason when marking lead as Not Interested or Lost
3. Duplicate Lead Detection - check for duplicates on new lead creation
4. Idle Lead Escalation - notifications for idle leads (5 days no activity)
5. Stage Transition Restriction - block direct transition from Interested/Follow-up to Not Interested
"""

import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestAuthSetup:
    """Get authentication tokens for testing"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "alex@bidinn.com",
            "password": "password123"
        })
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        return response.json().get("access_token")
    
    @pytest.fixture(scope="class")
    def admin_headers(self, admin_token):
        """Get admin headers"""
        return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


class TestRule1AssignmentEnforcement(TestAuthSetup):
    """Rule 1: Lead Assignment Enforcement - leads in certain stages must have an assigned salesperson"""
    
    def test_unassigned_lead_cannot_move_to_interested(self, admin_headers):
        """Test that unassigned lead cannot be moved to 'interested' status"""
        # First create an unassigned lead
        create_response = requests.post(f"{BASE_URL}/api/leads", json={
            "name": f"TEST_Rule1_Unassigned_{uuid.uuid4().hex[:8]}",
            "phone": f"+1-555-{uuid.uuid4().hex[:7]}",
            "source": "Website"
        }, headers=admin_headers)
        
        assert create_response.status_code == 201, f"Failed to create lead: {create_response.text}"
        lead_id = create_response.json()["id"]
        
        # Try to move to 'interested' without assignment - should fail
        update_response = requests.put(f"{BASE_URL}/api/leads/{lead_id}", json={
            "status": "interested"
        }, headers=admin_headers)
        
        assert update_response.status_code == 400, f"Expected 400, got {update_response.status_code}"
        data = update_response.json()
        assert "assignment" in data.get("detail", "").lower() or data.get("rule") == "assignment_required"
        print(f"PASS: Unassigned lead blocked from moving to 'interested' - {data.get('detail')}")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/leads/{lead_id}", headers=admin_headers)
    
    def test_unassigned_lead_cannot_move_to_not_answered(self, admin_headers):
        """Test that unassigned lead cannot be moved to 'not_answered' status"""
        create_response = requests.post(f"{BASE_URL}/api/leads", json={
            "name": f"TEST_Rule1_NotAnswered_{uuid.uuid4().hex[:8]}",
            "phone": f"+1-555-{uuid.uuid4().hex[:7]}",
            "source": "Website"
        }, headers=admin_headers)
        
        assert create_response.status_code == 201
        lead_id = create_response.json()["id"]
        
        update_response = requests.put(f"{BASE_URL}/api/leads/{lead_id}", json={
            "status": "not_answered"
        }, headers=admin_headers)
        
        assert update_response.status_code == 400
        data = update_response.json()
        assert data.get("rule") == "assignment_required" or "assign" in data.get("detail", "").lower()
        print(f"PASS: Unassigned lead blocked from moving to 'not_answered'")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/leads/{lead_id}", headers=admin_headers)
    
    def test_unassigned_lead_cannot_move_to_followup(self, admin_headers):
        """Test that unassigned lead cannot be moved to 'followup' status"""
        create_response = requests.post(f"{BASE_URL}/api/leads", json={
            "name": f"TEST_Rule1_Followup_{uuid.uuid4().hex[:8]}",
            "phone": f"+1-555-{uuid.uuid4().hex[:7]}",
            "source": "Website"
        }, headers=admin_headers)
        
        assert create_response.status_code == 201
        lead_id = create_response.json()["id"]
        
        update_response = requests.put(f"{BASE_URL}/api/leads/{lead_id}", json={
            "status": "followup"
        }, headers=admin_headers)
        
        assert update_response.status_code == 400
        data = update_response.json()
        assert data.get("rule") == "assignment_required" or "assign" in data.get("detail", "").lower()
        print(f"PASS: Unassigned lead blocked from moving to 'followup'")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/leads/{lead_id}", headers=admin_headers)
    
    def test_assigned_lead_can_move_to_interested(self, admin_headers):
        """Test that assigned lead CAN be moved to 'interested' status"""
        # Get a user to assign
        users_response = requests.get(f"{BASE_URL}/api/users", headers=admin_headers)
        assert users_response.status_code == 200
        users = users_response.json()
        sales_rep = next((u for u in users if u.get("role") in ["sales_rep", "team_lead"]), None)
        
        if not sales_rep:
            pytest.skip("No sales rep found for assignment test")
        
        # Create lead with assignment
        create_response = requests.post(f"{BASE_URL}/api/leads", json={
            "name": f"TEST_Rule1_Assigned_{uuid.uuid4().hex[:8]}",
            "phone": f"+1-555-{uuid.uuid4().hex[:7]}",
            "source": "Website",
            "assigned_to": sales_rep["id"]
        }, headers=admin_headers)
        
        assert create_response.status_code == 201
        lead_id = create_response.json()["id"]
        
        # Move to 'interested' - should succeed
        update_response = requests.put(f"{BASE_URL}/api/leads/{lead_id}", json={
            "status": "interested"
        }, headers=admin_headers)
        
        assert update_response.status_code == 200, f"Expected 200, got {update_response.status_code}: {update_response.text}"
        assert update_response.json()["status"] == "interested"
        print(f"PASS: Assigned lead successfully moved to 'interested'")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/leads/{lead_id}", headers=admin_headers)


class TestRule2ClosedReasonRequired(TestAuthSetup):
    """Rule 2: Closed Lead Reason Capture - require reason when marking lead as Not Interested or Lost"""
    
    def test_lost_status_requires_reason(self, admin_headers):
        """Test that changing to 'lost' status requires a closed_reason"""
        create_response = requests.post(f"{BASE_URL}/api/leads", json={
            "name": f"TEST_Rule2_Lost_{uuid.uuid4().hex[:8]}",
            "phone": f"+1-555-{uuid.uuid4().hex[:7]}",
            "source": "Website"
        }, headers=admin_headers)
        
        assert create_response.status_code == 201
        lead_id = create_response.json()["id"]
        
        # Try to change to 'lost' without reason - should fail
        update_response = requests.put(f"{BASE_URL}/api/leads/{lead_id}", json={
            "status": "lost"
        }, headers=admin_headers)
        
        assert update_response.status_code == 400, f"Expected 400, got {update_response.status_code}"
        data = update_response.json()
        assert data.get("rule") == "closed_reason_required" or "reason" in data.get("detail", "").lower()
        print(f"PASS: 'lost' status blocked without reason - {data.get('detail')}")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/leads/{lead_id}", headers=admin_headers)
    
    def test_not_interested_status_requires_reason(self, admin_headers):
        """Test that changing to 'not_interested' status requires a closed_reason"""
        create_response = requests.post(f"{BASE_URL}/api/leads", json={
            "name": f"TEST_Rule2_NotInterested_{uuid.uuid4().hex[:8]}",
            "phone": f"+1-555-{uuid.uuid4().hex[:7]}",
            "source": "Website"
        }, headers=admin_headers)
        
        assert create_response.status_code == 201
        lead_id = create_response.json()["id"]
        
        # Try to change to 'not_interested' without reason - should fail
        update_response = requests.put(f"{BASE_URL}/api/leads/{lead_id}", json={
            "status": "not_interested"
        }, headers=admin_headers)
        
        assert update_response.status_code == 400
        data = update_response.json()
        assert data.get("rule") == "closed_reason_required" or "reason" in data.get("detail", "").lower()
        print(f"PASS: 'not_interested' status blocked without reason")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/leads/{lead_id}", headers=admin_headers)
    
    def test_lost_status_succeeds_with_reason(self, admin_headers):
        """Test that changing to 'lost' status succeeds WITH a valid closed_reason"""
        create_response = requests.post(f"{BASE_URL}/api/leads", json={
            "name": f"TEST_Rule2_LostWithReason_{uuid.uuid4().hex[:8]}",
            "phone": f"+1-555-{uuid.uuid4().hex[:7]}",
            "source": "Website"
        }, headers=admin_headers)
        
        assert create_response.status_code == 201
        lead_id = create_response.json()["id"]
        
        # Change to 'lost' WITH reason - should succeed
        update_response = requests.put(f"{BASE_URL}/api/leads/{lead_id}", json={
            "status": "lost",
            "closed_reason": "price_too_high",
            "closed_reason_notes": "Customer found cheaper option"
        }, headers=admin_headers)
        
        assert update_response.status_code == 200, f"Expected 200, got {update_response.status_code}: {update_response.text}"
        data = update_response.json()
        assert data["status"] == "lost"
        assert data["closed_reason"] == "price_too_high"
        print(f"PASS: 'lost' status succeeded with reason")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/leads/{lead_id}", headers=admin_headers)
    
    def test_not_interested_status_succeeds_with_reason(self, admin_headers):
        """Test that changing to 'not_interested' status succeeds WITH a valid closed_reason"""
        create_response = requests.post(f"{BASE_URL}/api/leads", json={
            "name": f"TEST_Rule2_NotIntWithReason_{uuid.uuid4().hex[:8]}",
            "phone": f"+1-555-{uuid.uuid4().hex[:7]}",
            "source": "Website"
        }, headers=admin_headers)
        
        assert create_response.status_code == 201
        lead_id = create_response.json()["id"]
        
        # Change to 'not_interested' WITH reason - should succeed
        update_response = requests.put(f"{BASE_URL}/api/leads/{lead_id}", json={
            "status": "not_interested",
            "closed_reason": "just_browsing"
        }, headers=admin_headers)
        
        assert update_response.status_code == 200
        data = update_response.json()
        assert data["status"] == "not_interested"
        assert data["closed_reason"] == "just_browsing"
        print(f"PASS: 'not_interested' status succeeded with reason")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/leads/{lead_id}", headers=admin_headers)
    
    def test_available_closed_reasons_returned(self, admin_headers):
        """Test that API returns available closed reasons when required"""
        create_response = requests.post(f"{BASE_URL}/api/leads", json={
            "name": f"TEST_Rule2_Reasons_{uuid.uuid4().hex[:8]}",
            "phone": f"+1-555-{uuid.uuid4().hex[:7]}",
            "source": "Website"
        }, headers=admin_headers)
        
        assert create_response.status_code == 201
        lead_id = create_response.json()["id"]
        
        # Try to change to 'lost' without reason
        update_response = requests.put(f"{BASE_URL}/api/leads/{lead_id}", json={
            "status": "lost"
        }, headers=admin_headers)
        
        assert update_response.status_code == 400
        data = update_response.json()
        
        # Check if available_reasons is returned
        if "available_reasons" in data:
            reasons = data["available_reasons"]
            assert len(reasons) > 0
            reason_values = [r["value"] for r in reasons]
            assert "price_too_high" in reason_values
            assert "booked_elsewhere" in reason_values
            print(f"PASS: Available reasons returned: {reason_values}")
        else:
            print("INFO: available_reasons not returned in response (optional)")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/leads/{lead_id}", headers=admin_headers)


class TestRule3DuplicateDetection(TestAuthSetup):
    """Rule 3: Duplicate Lead Detection - check for duplicates on new lead creation"""
    
    def test_check_duplicate_endpoint(self, admin_headers):
        """Test POST /api/leads/check-duplicate returns duplicates for existing phone"""
        # First create a lead
        unique_phone = f"+1-555-DUP{uuid.uuid4().hex[:4]}"
        create_response = requests.post(f"{BASE_URL}/api/leads", json={
            "name": f"TEST_Rule3_Original_{uuid.uuid4().hex[:8]}",
            "phone": unique_phone,
            "source": "Website"
        }, headers=admin_headers)
        
        assert create_response.status_code == 201
        original_lead_id = create_response.json()["id"]
        
        # Check for duplicate
        check_response = requests.post(f"{BASE_URL}/api/leads/check-duplicate", json={
            "phone": unique_phone
        }, headers=admin_headers)
        
        assert check_response.status_code == 200
        data = check_response.json()
        assert data.get("hasDuplicate") == True
        assert len(data.get("duplicates", [])) > 0
        print(f"PASS: Duplicate detection found {len(data['duplicates'])} duplicate(s)")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/leads/{original_lead_id}", headers=admin_headers)
    
    def test_duplicate_create_blocked_returns_409(self, admin_headers):
        """Test POST /api/leads with duplicate phone returns 409 with duplicate info"""
        # First create a lead
        unique_phone = f"+1-555-BLK{uuid.uuid4().hex[:4]}"
        create_response = requests.post(f"{BASE_URL}/api/leads", json={
            "name": f"TEST_Rule3_Block_{uuid.uuid4().hex[:8]}",
            "phone": unique_phone,
            "source": "Website"
        }, headers=admin_headers)
        
        assert create_response.status_code == 201
        original_lead_id = create_response.json()["id"]
        
        # Try to create duplicate - should return 409
        duplicate_response = requests.post(f"{BASE_URL}/api/leads", json={
            "name": f"TEST_Rule3_Duplicate_{uuid.uuid4().hex[:8]}",
            "phone": unique_phone,
            "source": "Referral"
        }, headers=admin_headers)
        
        assert duplicate_response.status_code == 409, f"Expected 409, got {duplicate_response.status_code}"
        data = duplicate_response.json()
        assert "duplicate" in data.get("detail", "").lower()
        assert "duplicates" in data
        assert len(data["duplicates"]) > 0
        print(f"PASS: Duplicate creation blocked with 409 - found {len(data['duplicates'])} existing lead(s)")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/leads/{original_lead_id}", headers=admin_headers)
    
    def test_force_create_bypasses_duplicate_check(self, admin_headers):
        """Test POST /api/leads with duplicate phone AND force_create=true succeeds"""
        # First create a lead
        unique_phone = f"+1-555-FRC{uuid.uuid4().hex[:4]}"
        create_response = requests.post(f"{BASE_URL}/api/leads", json={
            "name": f"TEST_Rule3_Force_{uuid.uuid4().hex[:8]}",
            "phone": unique_phone,
            "source": "Website"
        }, headers=admin_headers)
        
        assert create_response.status_code == 201
        original_lead_id = create_response.json()["id"]
        
        # Force create duplicate - should succeed
        force_response = requests.post(f"{BASE_URL}/api/leads", json={
            "name": f"TEST_Rule3_ForceDup_{uuid.uuid4().hex[:8]}",
            "phone": unique_phone,
            "source": "Referral",
            "force_create": True
        }, headers=admin_headers)
        
        assert force_response.status_code == 201, f"Expected 201, got {force_response.status_code}: {force_response.text}"
        duplicate_lead_id = force_response.json()["id"]
        print(f"PASS: Force create succeeded despite duplicate phone")
        
        # Cleanup both leads
        requests.delete(f"{BASE_URL}/api/leads/{original_lead_id}", headers=admin_headers)
        requests.delete(f"{BASE_URL}/api/leads/{duplicate_lead_id}", headers=admin_headers)
    
    def test_no_duplicate_for_unique_phone(self, admin_headers):
        """Test that unique phone number doesn't trigger duplicate detection"""
        unique_phone = f"+1-555-UNQ{uuid.uuid4().hex[:4]}"
        
        check_response = requests.post(f"{BASE_URL}/api/leads/check-duplicate", json={
            "phone": unique_phone
        }, headers=admin_headers)
        
        assert check_response.status_code == 200
        data = check_response.json()
        assert data.get("hasDuplicate") == False
        assert len(data.get("duplicates", [])) == 0
        print(f"PASS: No duplicate found for unique phone")


class TestRule4NotificationsAPI(TestAuthSetup):
    """Rule 4: Idle Lead Escalation - notifications for managers if lead has no activity for 5 days"""
    
    def test_notifications_endpoint_exists(self, admin_headers):
        """Test GET /api/notifications returns notifications"""
        response = requests.get(f"{BASE_URL}/api/notifications", headers=admin_headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "notifications" in data
        assert "unread_count" in data
        print(f"PASS: Notifications endpoint works - {len(data['notifications'])} notifications, {data['unread_count']} unread")
    
    def test_notifications_unread_filter(self, admin_headers):
        """Test GET /api/notifications?unread_only=true filters correctly"""
        response = requests.get(f"{BASE_URL}/api/notifications?unread_only=true", headers=admin_headers)
        
        assert response.status_code == 200
        data = response.json()
        assert "notifications" in data
        # All returned notifications should be unread
        for notif in data["notifications"]:
            assert notif.get("is_read") == False or notif.get("is_read") is None
        print(f"PASS: Unread filter works - {len(data['notifications'])} unread notifications")
    
    def test_mark_notification_as_read(self, admin_headers):
        """Test PUT /api/notifications/:id/read marks notification as read"""
        # Get notifications first
        list_response = requests.get(f"{BASE_URL}/api/notifications", headers=admin_headers)
        assert list_response.status_code == 200
        notifications = list_response.json().get("notifications", [])
        
        if not notifications:
            pytest.skip("No notifications to test with")
        
        notif_id = notifications[0]["id"]
        
        # Mark as read
        read_response = requests.put(f"{BASE_URL}/api/notifications/{notif_id}/read", headers=admin_headers)
        assert read_response.status_code == 200
        assert read_response.json().get("is_read") == True
        print(f"PASS: Notification marked as read successfully")
    
    def test_mark_all_notifications_read(self, admin_headers):
        """Test PUT /api/notifications/mark-all-read marks all as read"""
        response = requests.put(f"{BASE_URL}/api/notifications/mark-all-read", headers=admin_headers)
        
        assert response.status_code == 200
        print(f"PASS: Mark all notifications as read endpoint works")


class TestRule5StageTransitionRestriction(TestAuthSetup):
    """Rule 5: Stage Transition Restriction - block direct transition from Interested/Follow-up to Not Interested"""
    
    def test_interested_to_not_interested_blocked(self, admin_headers):
        """Test that 'interested' lead cannot be moved directly to 'not_interested'"""
        # Get a user for assignment
        users_response = requests.get(f"{BASE_URL}/api/users", headers=admin_headers)
        users = users_response.json()
        sales_rep = next((u for u in users if u.get("role") in ["sales_rep", "team_lead"]), None)
        
        if not sales_rep:
            pytest.skip("No sales rep found")
        
        # Create and assign lead
        create_response = requests.post(f"{BASE_URL}/api/leads", json={
            "name": f"TEST_Rule5_IntToNotInt_{uuid.uuid4().hex[:8]}",
            "phone": f"+1-555-{uuid.uuid4().hex[:7]}",
            "source": "Website",
            "assigned_to": sales_rep["id"]
        }, headers=admin_headers)
        
        assert create_response.status_code == 201
        lead_id = create_response.json()["id"]
        
        # Move to 'interested' first
        update1 = requests.put(f"{BASE_URL}/api/leads/{lead_id}", json={
            "status": "interested"
        }, headers=admin_headers)
        assert update1.status_code == 200
        
        # Try to move to 'not_interested' - should be blocked
        update2 = requests.put(f"{BASE_URL}/api/leads/{lead_id}", json={
            "status": "not_interested",
            "closed_reason": "just_browsing"  # Even with reason, should be blocked
        }, headers=admin_headers)
        
        assert update2.status_code == 400, f"Expected 400, got {update2.status_code}"
        data = update2.json()
        assert "not interested" in data.get("detail", "").lower() or data.get("rule") == "stage_transition_restriction"
        print(f"PASS: Interested -> Not Interested blocked - {data.get('detail')}")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/leads/{lead_id}", headers=admin_headers)
    
    def test_followup_to_not_interested_blocked(self, admin_headers):
        """Test that 'followup' lead cannot be moved directly to 'not_interested'"""
        users_response = requests.get(f"{BASE_URL}/api/users", headers=admin_headers)
        users = users_response.json()
        sales_rep = next((u for u in users if u.get("role") in ["sales_rep", "team_lead"]), None)
        
        if not sales_rep:
            pytest.skip("No sales rep found")
        
        create_response = requests.post(f"{BASE_URL}/api/leads", json={
            "name": f"TEST_Rule5_FollowupToNotInt_{uuid.uuid4().hex[:8]}",
            "phone": f"+1-555-{uuid.uuid4().hex[:7]}",
            "source": "Website",
            "assigned_to": sales_rep["id"]
        }, headers=admin_headers)
        
        assert create_response.status_code == 201
        lead_id = create_response.json()["id"]
        
        # Move to 'followup' first
        update1 = requests.put(f"{BASE_URL}/api/leads/{lead_id}", json={
            "status": "followup"
        }, headers=admin_headers)
        assert update1.status_code == 200
        
        # Try to move to 'not_interested' - should be blocked
        update2 = requests.put(f"{BASE_URL}/api/leads/{lead_id}", json={
            "status": "not_interested",
            "closed_reason": "no_response"
        }, headers=admin_headers)
        
        assert update2.status_code == 400
        data = update2.json()
        assert "not interested" in data.get("detail", "").lower() or data.get("rule") == "stage_transition_restriction"
        print(f"PASS: Follow-up -> Not Interested blocked")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/leads/{lead_id}", headers=admin_headers)
    
    def test_interested_to_won_allowed(self, admin_headers):
        """Test that 'interested' lead CAN be moved to 'won'"""
        users_response = requests.get(f"{BASE_URL}/api/users", headers=admin_headers)
        users = users_response.json()
        sales_rep = next((u for u in users if u.get("role") in ["sales_rep", "team_lead"]), None)
        
        if not sales_rep:
            pytest.skip("No sales rep found")
        
        create_response = requests.post(f"{BASE_URL}/api/leads", json={
            "name": f"TEST_Rule5_IntToWon_{uuid.uuid4().hex[:8]}",
            "phone": f"+1-555-{uuid.uuid4().hex[:7]}",
            "source": "Website",
            "assigned_to": sales_rep["id"]
        }, headers=admin_headers)
        
        assert create_response.status_code == 201
        lead_id = create_response.json()["id"]
        
        # Move to 'interested'
        update1 = requests.put(f"{BASE_URL}/api/leads/{lead_id}", json={
            "status": "interested"
        }, headers=admin_headers)
        assert update1.status_code == 200
        
        # Move to 'won' - should succeed
        update2 = requests.put(f"{BASE_URL}/api/leads/{lead_id}", json={
            "status": "won"
        }, headers=admin_headers)
        
        assert update2.status_code == 200, f"Expected 200, got {update2.status_code}: {update2.text}"
        assert update2.json()["status"] == "won"
        print(f"PASS: Interested -> Won allowed")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/leads/{lead_id}", headers=admin_headers)
    
    def test_interested_to_lost_allowed_with_reason(self, admin_headers):
        """Test that 'interested' lead CAN be moved to 'lost' (with reason)"""
        users_response = requests.get(f"{BASE_URL}/api/users", headers=admin_headers)
        users = users_response.json()
        sales_rep = next((u for u in users if u.get("role") in ["sales_rep", "team_lead"]), None)
        
        if not sales_rep:
            pytest.skip("No sales rep found")
        
        create_response = requests.post(f"{BASE_URL}/api/leads", json={
            "name": f"TEST_Rule5_IntToLost_{uuid.uuid4().hex[:8]}",
            "phone": f"+1-555-{uuid.uuid4().hex[:7]}",
            "source": "Website",
            "assigned_to": sales_rep["id"]
        }, headers=admin_headers)
        
        assert create_response.status_code == 201
        lead_id = create_response.json()["id"]
        
        # Move to 'interested'
        update1 = requests.put(f"{BASE_URL}/api/leads/{lead_id}", json={
            "status": "interested"
        }, headers=admin_headers)
        assert update1.status_code == 200
        
        # Move to 'lost' with reason - should succeed
        update2 = requests.put(f"{BASE_URL}/api/leads/{lead_id}", json={
            "status": "lost",
            "closed_reason": "competitor"
        }, headers=admin_headers)
        
        assert update2.status_code == 200, f"Expected 200, got {update2.status_code}: {update2.text}"
        assert update2.json()["status"] == "lost"
        print(f"PASS: Interested -> Lost (with reason) allowed")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/leads/{lead_id}", headers=admin_headers)


class TestClosedReasonsEndpoint(TestAuthSetup):
    """Test the closed reasons endpoint"""
    
    def test_get_closed_reasons(self, admin_headers):
        """Test GET /api/leads/closed-reasons returns list of reasons"""
        response = requests.get(f"{BASE_URL}/api/leads/closed-reasons", headers=admin_headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        reasons = response.json()
        assert isinstance(reasons, list)
        assert len(reasons) > 0
        
        # Check structure
        for reason in reasons:
            assert "value" in reason
            assert "label" in reason
        
        # Check expected values exist
        values = [r["value"] for r in reasons]
        assert "price_too_high" in values
        assert "booked_elsewhere" in values
        assert "competitor" in values
        print(f"PASS: Closed reasons endpoint returns {len(reasons)} reasons")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
