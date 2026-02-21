from fastapi import FastAPI, APIRouter, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone, timedelta
import bcrypt
import jwt
from enum import Enum

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# JWT Configuration
JWT_SECRET = os.environ.get('JWT_SECRET', 'bidinn-secret-key-change-in-production')
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 24

# Feature flags
TELEPHONY_ENABLED = os.environ.get('TELEPHONY_ENABLED', 'false').lower() == 'true'

# Create the main app
app = FastAPI(title="Bidinn CRM API", version="1.0.0")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

security = HTTPBearer()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ==================== ENUMS ====================
class UserRole(str, Enum):
    ADMIN = "admin"
    MANAGER = "manager"
    TEAM_LEAD = "team_lead"
    SALES_REP = "sales_rep"

class LeadStatus(str, Enum):
    NEW = "new"
    CONTACTED = "contacted"
    QUALIFIED = "qualified"
    PROPOSAL = "proposal"
    NEGOTIATION = "negotiation"
    CLOSED_WON = "closed_won"
    CLOSED_LOST = "closed_lost"

class PaymentStatus(str, Enum):
    UNPAID = "unpaid"
    PARTIAL = "partial"
    PAID = "paid"

class CallOutcome(str, Enum):
    CONNECTED = "connected"
    NO_ANSWER = "no_answer"
    BUSY = "busy"
    VOICEMAIL = "voicemail"
    WRONG_NUMBER = "wrong_number"
    CALLBACK_REQUESTED = "callback_requested"

# ==================== MODELS ====================
class UserBase(BaseModel):
    email: EmailStr
    name: str
    role: UserRole = UserRole.SALES_REP
    avatar: Optional[str] = None
    is_active: bool = True

class UserCreate(UserBase):
    password: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    email: str
    name: str
    role: UserRole
    avatar: Optional[str] = None
    is_active: bool = True
    created_at: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse

class LeadBase(BaseModel):
    name: str
    phone: str
    email: Optional[str] = None
    source: str
    campaign: Optional[str] = None
    city: Optional[str] = None
    notes: Optional[str] = None
    next_followup: Optional[str] = None

class LeadCreate(LeadBase):
    pass

class LeadUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    source: Optional[str] = None
    campaign: Optional[str] = None
    city: Optional[str] = None
    status: Optional[LeadStatus] = None
    assigned_to: Optional[str] = None
    notes: Optional[str] = None
    next_followup: Optional[str] = None

class LeadResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    phone: str
    email: Optional[str] = None
    source: str
    campaign: Optional[str] = None
    city: Optional[str] = None
    status: LeadStatus
    assigned_to: Optional[str] = None
    assigned_name: Optional[str] = None
    attempt_count: int = 0
    last_activity: Optional[str] = None
    next_followup: Optional[str] = None
    notes: Optional[str] = None
    created_at: str
    updated_at: str
    is_overdue: bool = False
    hours_since_creation: float = 0

class CallLogCreate(BaseModel):
    lead_id: str
    outcome: CallOutcome
    duration_minutes: int = 0
    notes: Optional[str] = None
    next_followup: Optional[str] = None

class CallLogResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    lead_id: str
    user_id: str
    user_name: str
    outcome: CallOutcome
    duration_minutes: int
    notes: Optional[str] = None
    next_followup: Optional[str] = None
    created_at: str

class BookingCreate(BaseModel):
    lead_id: str
    hotel_name: str
    check_in: str
    check_out: str
    final_price: float
    bid_price: float
    notes: Optional[str] = None

class BookingUpdate(BaseModel):
    hotel_name: Optional[str] = None
    check_in: Optional[str] = None
    check_out: Optional[str] = None
    final_price: Optional[float] = None
    bid_price: Optional[float] = None
    notes: Optional[str] = None

class BookingResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    lead_id: str
    lead_name: Optional[str] = None
    hotel_name: str
    check_in: str
    check_out: str
    final_price: float
    bid_price: float
    payment_status: PaymentStatus
    payment_amount: float = 0
    notes: Optional[str] = None
    created_at: str
    created_by: str

class PaymentCreate(BaseModel):
    booking_id: str
    amount: float
    notes: Optional[str] = None

class PaymentResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    booking_id: str
    amount: float
    notes: Optional[str] = None
    created_at: str
    created_by: str

class ActivityResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    lead_id: str
    user_id: Optional[str] = None
    user_name: Optional[str] = None
    action: str
    details: Optional[str] = None
    created_at: str

class NotificationResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    user_id: str
    title: str
    message: str
    type: str
    is_read: bool = False
    lead_id: Optional[str] = None
    created_at: str

class DashboardStats(BaseModel):
    total_leads: int = 0
    new_leads: int = 0
    contacted_leads: int = 0
    qualified_leads: int = 0
    closed_won: int = 0
    closed_lost: int = 0
    overdue_followups: int = 0
    uncontacted_over_1hr: int = 0
    total_revenue: float = 0
    monthly_revenue: float = 0
    conversion_rate: float = 0
    avg_deal_size: float = 0

class LeaderboardEntry(BaseModel):
    user_id: str
    user_name: str
    avatar: Optional[str] = None
    leads_closed: int = 0
    revenue: float = 0
    conversion_rate: float = 0
    calls_made: int = 0

# ==================== AUTH HELPERS ====================
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))

def create_token(user_id: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")
        
        user = await db.users.find_one({"id": user_id}, {"_id": 0})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

def require_roles(allowed_roles: List[UserRole]):
    async def role_checker(user: dict = Depends(get_current_user)):
        if UserRole(user["role"]) not in allowed_roles:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return user
    return role_checker

# ==================== AUTH ROUTES ====================
@api_router.post("/auth/register", response_model=UserResponse)
async def register(user_data: UserCreate):
    existing = await db.users.find_one({"email": user_data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    user_dict = {
        "id": str(uuid.uuid4()),
        "email": user_data.email,
        "name": user_data.name,
        "role": user_data.role.value,
        "avatar": user_data.avatar,
        "is_active": user_data.is_active,
        "password_hash": hash_password(user_data.password),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.users.insert_one(user_dict)
    
    return UserResponse(
        id=user_dict["id"],
        email=user_dict["email"],
        name=user_dict["name"],
        role=UserRole(user_dict["role"]),
        avatar=user_dict["avatar"],
        is_active=user_dict["is_active"],
        created_at=user_dict["created_at"]
    )

@api_router.post("/auth/login", response_model=TokenResponse)
async def login(credentials: UserLogin):
    user = await db.users.find_one({"email": credentials.email}, {"_id": 0})
    if not user or not verify_password(credentials.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    if not user.get("is_active", True):
        raise HTTPException(status_code=401, detail="Account is disabled")
    
    token = create_token(user["id"], user["role"])
    
    return TokenResponse(
        access_token=token,
        user=UserResponse(
            id=user["id"],
            email=user["email"],
            name=user["name"],
            role=UserRole(user["role"]),
            avatar=user.get("avatar"),
            is_active=user.get("is_active", True),
            created_at=user["created_at"]
        )
    )

@api_router.get("/auth/me", response_model=UserResponse)
async def get_me(user: dict = Depends(get_current_user)):
    return UserResponse(
        id=user["id"],
        email=user["email"],
        name=user["name"],
        role=UserRole(user["role"]),
        avatar=user.get("avatar"),
        is_active=user.get("is_active", True),
        created_at=user["created_at"]
    )

# ==================== USER ROUTES ====================
@api_router.get("/users", response_model=List[UserResponse])
async def get_users(user: dict = Depends(get_current_user)):
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(1000)
    return [UserResponse(**u, role=UserRole(u["role"])) for u in users]

@api_router.get("/users/{user_id}", response_model=UserResponse)
async def get_user(user_id: str, user: dict = Depends(get_current_user)):
    found = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    if not found:
        raise HTTPException(status_code=404, detail="User not found")
    return UserResponse(**found, role=UserRole(found["role"]))

@api_router.put("/users/{user_id}", response_model=UserResponse)
async def update_user(user_id: str, update_data: dict, user: dict = Depends(require_roles([UserRole.ADMIN, UserRole.MANAGER]))):
    # Remove sensitive fields
    update_data.pop("password_hash", None)
    update_data.pop("id", None)
    
    result = await db.users.update_one({"id": user_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    
    found = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    return UserResponse(**found, role=UserRole(found["role"]))

# ==================== LEAD HELPERS ====================
async def add_activity(lead_id: str, action: str, details: str = None, user_id: str = None, user_name: str = None):
    activity = {
        "id": str(uuid.uuid4()),
        "lead_id": lead_id,
        "user_id": user_id,
        "user_name": user_name,
        "action": action,
        "details": details,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.activities.insert_one(activity)

async def create_notification(user_id: str, title: str, message: str, notif_type: str, lead_id: str = None):
    notification = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "title": title,
        "message": message,
        "type": notif_type,
        "is_read": False,
        "lead_id": lead_id,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.notifications.insert_one(notification)

def calculate_lead_metrics(lead: dict) -> dict:
    """Calculate lead metrics like overdue status and hours since creation"""
    created_at = datetime.fromisoformat(lead["created_at"].replace("Z", "+00:00"))
    now = datetime.now(timezone.utc)
    hours_since = (now - created_at).total_seconds() / 3600
    
    is_overdue = False
    if lead["status"] == LeadStatus.NEW.value and lead.get("attempt_count", 0) == 0:
        is_overdue = hours_since > 1
    
    lead["hours_since_creation"] = round(hours_since, 2)
    lead["is_overdue"] = is_overdue
    return lead

# ==================== LEAD ROUTES ====================
@api_router.post("/leads", response_model=LeadResponse)
async def create_lead(lead_data: LeadCreate, user: dict = Depends(get_current_user)):
    now = datetime.now(timezone.utc).isoformat()
    lead_dict = {
        "id": str(uuid.uuid4()),
        **lead_data.model_dump(),
        "status": LeadStatus.NEW.value,
        "assigned_to": None,
        "assigned_name": None,
        "attempt_count": 0,
        "last_activity": None,
        "created_at": now,
        "updated_at": now
    }
    await db.leads.insert_one(lead_dict)
    await add_activity(lead_dict["id"], "Lead created", f"New lead from {lead_data.source}", user["id"], user["name"])
    
    lead_dict = calculate_lead_metrics(lead_dict)
    return LeadResponse(**lead_dict)

@api_router.get("/leads", response_model=List[LeadResponse])
async def get_leads(
    status: Optional[str] = None,
    assigned_to: Optional[str] = None,
    source: Optional[str] = None,
    search: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    user: dict = Depends(get_current_user)
):
    query = {}
    if status:
        query["status"] = status
    if assigned_to:
        query["assigned_to"] = assigned_to
    if source:
        query["source"] = source
    if search:
        query["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"phone": {"$regex": search, "$options": "i"}},
            {"email": {"$regex": search, "$options": "i"}}
        ]
    
    # Sales reps can only see their assigned leads
    if UserRole(user["role"]) == UserRole.SALES_REP:
        query["$or"] = [
            {"assigned_to": user["id"]},
            {"assigned_to": None}
        ]
    
    leads = await db.leads.find(query, {"_id": 0}).skip(skip).limit(limit).sort("created_at", -1).to_list(limit)
    return [LeadResponse(**calculate_lead_metrics(l)) for l in leads]

@api_router.get("/leads/uncontacted", response_model=List[LeadResponse])
async def get_uncontacted_leads(user: dict = Depends(require_roles([UserRole.ADMIN, UserRole.MANAGER, UserRole.TEAM_LEAD]))):
    """Get leads that haven't been contacted within 1 hour"""
    one_hour_ago = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    
    leads = await db.leads.find({
        "status": LeadStatus.NEW.value,
        "attempt_count": 0,
        "created_at": {"$lt": one_hour_ago}
    }, {"_id": 0}).sort("created_at", 1).to_list(1000)
    
    return [LeadResponse(**calculate_lead_metrics(l)) for l in leads]

@api_router.get("/leads/{lead_id}", response_model=LeadResponse)
async def get_lead(lead_id: str, user: dict = Depends(get_current_user)):
    lead = await db.leads.find_one({"id": lead_id}, {"_id": 0})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    return LeadResponse(**calculate_lead_metrics(lead))

@api_router.put("/leads/{lead_id}", response_model=LeadResponse)
async def update_lead(lead_id: str, update_data: LeadUpdate, user: dict = Depends(get_current_user)):
    update_dict = {k: v for k, v in update_data.model_dump().items() if v is not None}
    
    if "status" in update_dict:
        update_dict["status"] = update_dict["status"].value
    
    update_dict["updated_at"] = datetime.now(timezone.utc).isoformat()
    update_dict["last_activity"] = update_dict["updated_at"]
    
    # If assigning to someone, get their name
    if "assigned_to" in update_dict and update_dict["assigned_to"]:
        assigned_user = await db.users.find_one({"id": update_dict["assigned_to"]}, {"_id": 0})
        if assigned_user:
            update_dict["assigned_name"] = assigned_user["name"]
    
    result = await db.leads.update_one({"id": lead_id}, {"$set": update_dict})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    await add_activity(lead_id, "Lead updated", str(update_dict), user["id"], user["name"])
    
    lead = await db.leads.find_one({"id": lead_id}, {"_id": 0})
    return LeadResponse(**calculate_lead_metrics(lead))

@api_router.delete("/leads/{lead_id}")
async def delete_lead(lead_id: str, user: dict = Depends(require_roles([UserRole.ADMIN, UserRole.MANAGER]))):
    result = await db.leads.delete_one({"id": lead_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Lead not found")
    return {"message": "Lead deleted"}

@api_router.post("/leads/{lead_id}/assign")
async def assign_lead(lead_id: str, assignee_id: str, user: dict = Depends(require_roles([UserRole.ADMIN, UserRole.MANAGER, UserRole.TEAM_LEAD]))):
    assignee = await db.users.find_one({"id": assignee_id}, {"_id": 0})
    if not assignee:
        raise HTTPException(status_code=404, detail="Assignee not found")
    
    result = await db.leads.update_one(
        {"id": lead_id},
        {"$set": {
            "assigned_to": assignee_id,
            "assigned_name": assignee["name"],
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    await add_activity(lead_id, "Lead assigned", f"Assigned to {assignee['name']}", user["id"], user["name"])
    await create_notification(assignee_id, "New Lead Assigned", f"You have been assigned a new lead", "assignment", lead_id)
    
    return {"message": "Lead assigned successfully"}

# ==================== CALL LOG ROUTES ====================
@api_router.post("/calls", response_model=CallLogResponse)
async def log_call(call_data: CallLogCreate, user: dict = Depends(get_current_user)):
    lead = await db.leads.find_one({"id": call_data.lead_id}, {"_id": 0})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    now = datetime.now(timezone.utc).isoformat()
    call_dict = {
        "id": str(uuid.uuid4()),
        "lead_id": call_data.lead_id,
        "user_id": user["id"],
        "user_name": user["name"],
        "outcome": call_data.outcome.value,
        "duration_minutes": call_data.duration_minutes,
        "notes": call_data.notes,
        "next_followup": call_data.next_followup,
        "created_at": now
    }
    await db.calls.insert_one(call_dict)
    
    # Update lead
    update_data = {
        "attempt_count": lead.get("attempt_count", 0) + 1,
        "last_activity": now,
        "updated_at": now
    }
    if call_data.next_followup:
        update_data["next_followup"] = call_data.next_followup
    
    # If connected, move to contacted status
    if call_data.outcome == CallOutcome.CONNECTED and lead["status"] == LeadStatus.NEW.value:
        update_data["status"] = LeadStatus.CONTACTED.value
    
    await db.leads.update_one({"id": call_data.lead_id}, {"$set": update_data})
    await add_activity(call_data.lead_id, "Call logged", f"{call_data.outcome.value} - {call_data.duration_minutes} min", user["id"], user["name"])
    
    return CallLogResponse(**call_dict)

@api_router.get("/calls", response_model=List[CallLogResponse])
async def get_calls(lead_id: Optional[str] = None, user_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    query = {}
    if lead_id:
        query["lead_id"] = lead_id
    if user_id:
        query["user_id"] = user_id
    
    calls = await db.calls.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return [CallLogResponse(**c, outcome=CallOutcome(c["outcome"])) for c in calls]

# ==================== BOOKING ROUTES ====================
@api_router.post("/bookings", response_model=BookingResponse)
async def create_booking(booking_data: BookingCreate, user: dict = Depends(get_current_user)):
    lead = await db.leads.find_one({"id": booking_data.lead_id}, {"_id": 0})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    now = datetime.now(timezone.utc).isoformat()
    booking_dict = {
        "id": str(uuid.uuid4()),
        **booking_data.model_dump(),
        "lead_name": lead["name"],
        "payment_status": PaymentStatus.UNPAID.value,
        "payment_amount": 0,
        "created_at": now,
        "created_by": user["id"]
    }
    await db.bookings.insert_one(booking_dict)
    
    # Update lead to closed_won
    await db.leads.update_one(
        {"id": booking_data.lead_id},
        {"$set": {"status": LeadStatus.CLOSED_WON.value, "updated_at": now, "last_activity": now}}
    )
    await add_activity(booking_data.lead_id, "Booking created", f"Hotel: {booking_data.hotel_name}", user["id"], user["name"])
    
    return BookingResponse(**booking_dict, payment_status=PaymentStatus(booking_dict["payment_status"]))

@api_router.get("/bookings", response_model=List[BookingResponse])
async def get_bookings(
    payment_status: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    user: dict = Depends(get_current_user)
):
    query = {}
    if payment_status:
        query["payment_status"] = payment_status
    
    bookings = await db.bookings.find(query, {"_id": 0}).skip(skip).limit(limit).sort("created_at", -1).to_list(limit)
    return [BookingResponse(**b, payment_status=PaymentStatus(b["payment_status"])) for b in bookings]

@api_router.get("/bookings/{booking_id}", response_model=BookingResponse)
async def get_booking(booking_id: str, user: dict = Depends(get_current_user)):
    booking = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    return BookingResponse(**booking, payment_status=PaymentStatus(booking["payment_status"]))

@api_router.put("/bookings/{booking_id}", response_model=BookingResponse)
async def update_booking(booking_id: str, update_data: BookingUpdate, user: dict = Depends(get_current_user)):
    update_dict = {k: v for k, v in update_data.model_dump().items() if v is not None}
    
    result = await db.bookings.update_one({"id": booking_id}, {"$set": update_dict})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Booking not found")
    
    booking = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    return BookingResponse(**booking, payment_status=PaymentStatus(booking["payment_status"]))

# ==================== PAYMENT ROUTES ====================
@api_router.post("/payments", response_model=PaymentResponse)
async def record_payment(payment_data: PaymentCreate, user: dict = Depends(get_current_user)):
    booking = await db.bookings.find_one({"id": payment_data.booking_id}, {"_id": 0})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    
    now = datetime.now(timezone.utc).isoformat()
    payment_dict = {
        "id": str(uuid.uuid4()),
        "booking_id": payment_data.booking_id,
        "amount": payment_data.amount,
        "notes": payment_data.notes,
        "created_at": now,
        "created_by": user["id"]
    }
    await db.payments.insert_one(payment_dict)
    
    # Update booking payment status
    new_payment_amount = booking.get("payment_amount", 0) + payment_data.amount
    new_status = PaymentStatus.PARTIAL.value
    if new_payment_amount >= booking["final_price"]:
        new_status = PaymentStatus.PAID.value
    
    await db.bookings.update_one(
        {"id": payment_data.booking_id},
        {"$set": {"payment_amount": new_payment_amount, "payment_status": new_status}}
    )
    
    if booking.get("lead_id"):
        await add_activity(booking["lead_id"], "Payment recorded", f"Amount: ${payment_data.amount}", user["id"], user["name"])
    
    return PaymentResponse(**payment_dict)

@api_router.get("/payments", response_model=List[PaymentResponse])
async def get_payments(booking_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    query = {}
    if booking_id:
        query["booking_id"] = booking_id
    
    payments = await db.payments.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return [PaymentResponse(**p) for p in payments]

# ==================== ACTIVITY ROUTES ====================
@api_router.get("/activities", response_model=List[ActivityResponse])
async def get_activities(lead_id: Optional[str] = None, limit: int = 50, user: dict = Depends(get_current_user)):
    query = {}
    if lead_id:
        query["lead_id"] = lead_id
    
    activities = await db.activities.find(query, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return [ActivityResponse(**a) for a in activities]

# ==================== NOTIFICATION ROUTES ====================
@api_router.get("/notifications", response_model=List[NotificationResponse])
async def get_notifications(user: dict = Depends(get_current_user)):
    notifications = await db.notifications.find(
        {"user_id": user["id"]},
        {"_id": 0}
    ).sort("created_at", -1).to_list(50)
    return [NotificationResponse(**n) for n in notifications]

@api_router.put("/notifications/{notification_id}/read")
async def mark_notification_read(notification_id: str, user: dict = Depends(get_current_user)):
    result = await db.notifications.update_one(
        {"id": notification_id, "user_id": user["id"]},
        {"$set": {"is_read": True}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"message": "Notification marked as read"}

@api_router.put("/notifications/read-all")
async def mark_all_notifications_read(user: dict = Depends(get_current_user)):
    await db.notifications.update_many(
        {"user_id": user["id"], "is_read": False},
        {"$set": {"is_read": True}}
    )
    return {"message": "All notifications marked as read"}

# ==================== DASHBOARD ROUTES ====================
@api_router.get("/dashboard/stats", response_model=DashboardStats)
async def get_dashboard_stats(user: dict = Depends(get_current_user)):
    role = UserRole(user["role"])
    
    # Base query for role-based filtering
    lead_query = {}
    if role == UserRole.SALES_REP:
        lead_query["assigned_to"] = user["id"]
    
    # Count leads by status
    total_leads = await db.leads.count_documents(lead_query)
    new_leads = await db.leads.count_documents({**lead_query, "status": LeadStatus.NEW.value})
    contacted_leads = await db.leads.count_documents({**lead_query, "status": LeadStatus.CONTACTED.value})
    qualified_leads = await db.leads.count_documents({**lead_query, "status": LeadStatus.QUALIFIED.value})
    closed_won = await db.leads.count_documents({**lead_query, "status": LeadStatus.CLOSED_WON.value})
    closed_lost = await db.leads.count_documents({**lead_query, "status": LeadStatus.CLOSED_LOST.value})
    
    # Overdue follow-ups
    now = datetime.now(timezone.utc).isoformat()
    overdue_followups = await db.leads.count_documents({
        **lead_query,
        "next_followup": {"$lt": now, "$ne": None},
        "status": {"$nin": [LeadStatus.CLOSED_WON.value, LeadStatus.CLOSED_LOST.value]}
    })
    
    # Uncontacted over 1 hour
    one_hour_ago = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    uncontacted_over_1hr = await db.leads.count_documents({
        "status": LeadStatus.NEW.value,
        "attempt_count": 0,
        "created_at": {"$lt": one_hour_ago}
    })
    
    # Revenue calculations
    booking_query = {}
    if role == UserRole.SALES_REP:
        booking_query["created_by"] = user["id"]
    
    bookings = await db.bookings.find(booking_query, {"_id": 0}).to_list(10000)
    total_revenue = sum(b.get("payment_amount", 0) for b in bookings)
    
    # Monthly revenue (current month)
    month_start = datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()
    monthly_bookings = [b for b in bookings if b.get("created_at", "") >= month_start]
    monthly_revenue = sum(b.get("payment_amount", 0) for b in monthly_bookings)
    
    # Conversion rate
    conversion_rate = (closed_won / total_leads * 100) if total_leads > 0 else 0
    avg_deal_size = (total_revenue / closed_won) if closed_won > 0 else 0
    
    return DashboardStats(
        total_leads=total_leads,
        new_leads=new_leads,
        contacted_leads=contacted_leads,
        qualified_leads=qualified_leads,
        closed_won=closed_won,
        closed_lost=closed_lost,
        overdue_followups=overdue_followups,
        uncontacted_over_1hr=uncontacted_over_1hr,
        total_revenue=round(total_revenue, 2),
        monthly_revenue=round(monthly_revenue, 2),
        conversion_rate=round(conversion_rate, 2),
        avg_deal_size=round(avg_deal_size, 2)
    )

@api_router.get("/dashboard/leaderboard", response_model=List[LeaderboardEntry])
async def get_leaderboard(user: dict = Depends(get_current_user)):
    users = await db.users.find({"role": {"$in": [UserRole.SALES_REP.value, UserRole.TEAM_LEAD.value]}}, {"_id": 0}).to_list(100)
    
    leaderboard = []
    for u in users:
        # Get closed leads
        leads_closed = await db.leads.count_documents({
            "assigned_to": u["id"],
            "status": LeadStatus.CLOSED_WON.value
        })
        
        # Get total leads for conversion
        total_leads = await db.leads.count_documents({"assigned_to": u["id"]})
        conversion_rate = (leads_closed / total_leads * 100) if total_leads > 0 else 0
        
        # Get revenue
        bookings = await db.bookings.find({"created_by": u["id"]}, {"_id": 0}).to_list(10000)
        revenue = sum(b.get("payment_amount", 0) for b in bookings)
        
        # Get calls made
        calls_made = await db.calls.count_documents({"user_id": u["id"]})
        
        leaderboard.append(LeaderboardEntry(
            user_id=u["id"],
            user_name=u["name"],
            avatar=u.get("avatar"),
            leads_closed=leads_closed,
            revenue=round(revenue, 2),
            conversion_rate=round(conversion_rate, 2),
            calls_made=calls_made
        ))
    
    # Sort by revenue descending
    leaderboard.sort(key=lambda x: x.revenue, reverse=True)
    return leaderboard

@api_router.get("/dashboard/pipeline-stats")
async def get_pipeline_stats(user: dict = Depends(get_current_user)):
    """Get lead counts by pipeline stage"""
    pipeline = await db.leads.aggregate([
        {"$group": {"_id": "$status", "count": {"$sum": 1}}}
    ]).to_list(100)
    
    return {item["_id"]: item["count"] for item in pipeline}

@api_router.get("/dashboard/revenue-trend")
async def get_revenue_trend(months: int = 6, user: dict = Depends(get_current_user)):
    """Get revenue trend for the last N months"""
    trends = []
    now = datetime.now(timezone.utc)
    
    for i in range(months - 1, -1, -1):
        month_date = now - timedelta(days=30 * i)
        month_start = month_date.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        
        if i == 0:
            month_end = now
        else:
            next_month = month_start + timedelta(days=32)
            month_end = next_month.replace(day=1)
        
        bookings = await db.bookings.find({
            "created_at": {
                "$gte": month_start.isoformat(),
                "$lt": month_end.isoformat()
            }
        }, {"_id": 0}).to_list(10000)
        
        revenue = sum(b.get("payment_amount", 0) for b in bookings)
        
        trends.append({
            "month": month_start.strftime("%b %Y"),
            "revenue": round(revenue, 2)
        })
    
    return trends

@api_router.get("/dashboard/source-performance")
async def get_source_performance(user: dict = Depends(get_current_user)):
    """Get lead performance by source"""
    pipeline = await db.leads.aggregate([
        {"$group": {
            "_id": "$source",
            "total": {"$sum": 1},
            "closed_won": {
                "$sum": {"$cond": [{"$eq": ["$status", LeadStatus.CLOSED_WON.value]}, 1, 0]}
            }
        }}
    ]).to_list(100)
    
    result = []
    for item in pipeline:
        conversion = (item["closed_won"] / item["total"] * 100) if item["total"] > 0 else 0
        result.append({
            "source": item["_id"],
            "total_leads": item["total"],
            "closed_won": item["closed_won"],
            "conversion_rate": round(conversion, 2)
        })
    
    return result

# ==================== AUTO RESET JOB ====================
@api_router.post("/admin/run-auto-reset")
async def run_auto_reset(user: dict = Depends(require_roles([UserRole.ADMIN]))):
    """Manually trigger the 30-day auto-reset job"""
    thirty_days_ago = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    
    # Find leads that should be reset
    leads_to_reset = await db.leads.find({
        "status": {"$nin": [LeadStatus.NEW.value, LeadStatus.CLOSED_WON.value, LeadStatus.CLOSED_LOST.value]},
        "last_activity": {"$lt": thirty_days_ago}
    }, {"_id": 0}).to_list(1000)
    
    reset_count = 0
    for lead in leads_to_reset:
        # Check if there's been any activity in the last 30 days
        recent_activity = await db.activities.find_one({
            "lead_id": lead["id"],
            "created_at": {"$gte": thirty_days_ago}
        })
        
        if not recent_activity:
            # Reset the lead
            await db.leads.update_one(
                {"id": lead["id"]},
                {"$set": {
                    "status": LeadStatus.NEW.value,
                    "assigned_to": None,
                    "assigned_name": None,
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }}
            )
            await add_activity(lead["id"], "Auto-reset", "Lead reset due to 30 days of inactivity", None, "System")
            
            # Notify managers
            managers = await db.users.find({"role": {"$in": [UserRole.MANAGER.value, UserRole.ADMIN.value]}}, {"_id": 0}).to_list(100)
            for manager in managers:
                await create_notification(
                    manager["id"],
                    "Lead Auto-Reset",
                    f"Lead '{lead['name']}' has been reset due to inactivity",
                    "auto_reset",
                    lead["id"]
                )
            
            reset_count += 1
    
    return {"message": f"Auto-reset completed. {reset_count} leads reset."}

# ==================== SEED DATA ====================
@api_router.post("/admin/seed-data")
async def seed_data(user: dict = Depends(require_roles([UserRole.ADMIN]))):
    """Seed comprehensive demo data"""
    # Check if data already exists
    existing_users = await db.users.count_documents({})
    if existing_users > 1:
        return {"message": "Data already seeded"}
    
    # Create users
    users_data = [
        {"name": "Alex Thompson", "email": "alex@bidinn.com", "role": UserRole.ADMIN.value, "avatar": "https://images.unsplash.com/photo-1576558656222-ba66febe3dec?crop=entropy&cs=srgb&fm=jpg&q=85&w=100"},
        {"name": "Sarah Mitchell", "email": "sarah@bidinn.com", "role": UserRole.MANAGER.value, "avatar": "https://images.unsplash.com/photo-1762522926157-bcc04bf0b10a?crop=entropy&cs=srgb&fm=jpg&q=85&w=100"},
        {"name": "Michael Chen", "email": "michael@bidinn.com", "role": UserRole.TEAM_LEAD.value, "avatar": "https://images.unsplash.com/photo-1672685667592-0392f458f46f?crop=entropy&cs=srgb&fm=jpg&q=85&w=100"},
        {"name": "Emily Davis", "email": "emily@bidinn.com", "role": UserRole.SALES_REP.value, "avatar": "https://images.pexels.com/photos/30004323/pexels-photo-30004323.jpeg?w=100"},
        {"name": "James Wilson", "email": "james@bidinn.com", "role": UserRole.SALES_REP.value},
        {"name": "Lisa Anderson", "email": "lisa@bidinn.com", "role": UserRole.SALES_REP.value},
        {"name": "Robert Taylor", "email": "robert@bidinn.com", "role": UserRole.SALES_REP.value},
        {"name": "Jennifer Brown", "email": "jennifer@bidinn.com", "role": UserRole.SALES_REP.value},
        {"name": "David Martinez", "email": "david@bidinn.com", "role": UserRole.SALES_REP.value},
        {"name": "Amanda Garcia", "email": "amanda@bidinn.com", "role": UserRole.SALES_REP.value},
        {"name": "Christopher Lee", "email": "chris@bidinn.com", "role": UserRole.SALES_REP.value},
        {"name": "Michelle White", "email": "michelle@bidinn.com", "role": UserRole.SALES_REP.value},
        {"name": "Daniel Harris", "email": "daniel@bidinn.com", "role": UserRole.SALES_REP.value},
        {"name": "Jessica Clark", "email": "jessica@bidinn.com", "role": UserRole.SALES_REP.value},
        {"name": "Kevin Lewis", "email": "kevin@bidinn.com", "role": UserRole.SALES_REP.value},
    ]
    
    user_ids = []
    for u in users_data:
        # Check if user already exists
        existing = await db.users.find_one({"email": u["email"]})
        if existing:
            user_ids.append(existing["id"])
            continue
        
        user_doc = {
            "id": str(uuid.uuid4()),
            **u,
            "is_active": True,
            "password_hash": hash_password("password123"),
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.users.insert_one(user_doc)
        user_ids.append(user_doc["id"])
    
    # Lead sources and campaigns
    sources = ["Website", "Referral", "Google Ads", "Facebook", "LinkedIn", "Cold Call", "Trade Show", "Partner"]
    campaigns = ["Summer Sale 2024", "Holiday Special", "New Year Promo", "Spring Campaign", "Partner Referral"]
    cities = ["New York", "Los Angeles", "Chicago", "Houston", "Phoenix", "Philadelphia", "San Antonio", "San Diego", "Dallas", "San Jose"]
    
    # Create leads
    statuses = list(LeadStatus)
    leads_created = []
    
    lead_names = [
        "Acme Corporation", "TechStart Inc", "Global Solutions", "Prime Industries", "Vista Holdings",
        "Summit Partners", "Nexus Group", "Atlas Enterprises", "Pinnacle Systems", "Vanguard LLC",
        "Horizon Tech", "Apex Dynamics", "Sterling Corp", "Quantum Labs", "Phoenix Digital",
        "Evergreen Solutions", "Titan Industries", "Nova Ventures", "Blue Ocean Inc", "Red Rock Partners",
        "Silver Creek LLC", "Golden Gate Corp", "Pacific Edge", "Mountain View Tech", "Valley Stream Inc",
        "Coastal Enterprises", "Metro Systems", "Urban Solutions", "Suburban Group", "Rural Partners",
        "Northern Lights Co", "Southern Cross LLC", "Eastern Alliance", "Western Frontier", "Central Hub Inc",
        "Alpha Analytics", "Beta Solutions", "Gamma Tech", "Delta Corp", "Epsilon Partners",
        "Zeta Innovations", "Theta Systems", "Iota Group", "Kappa Ventures", "Lambda Labs",
        "Omega Industries", "Sigma Solutions", "Tau Tech", "Upsilon Corp", "Chi Enterprises",
        "Psi Partners", "Phi Holdings", "Rho Systems", "Nu Ventures", "Mu Labs"
    ]
    
    for i, name in enumerate(lead_names):
        status = statuses[i % len(statuses)]
        assigned_to = user_ids[3 + (i % 12)] if i % 3 != 0 else None  # Assign to sales reps
        
        # Random creation date in last 60 days
        days_ago = i % 60
        hours_ago = (i * 7) % 24
        created_at = (datetime.now(timezone.utc) - timedelta(days=days_ago, hours=hours_ago)).isoformat()
        
        assigned_name = None
        if assigned_to:
            for u in users_data:
                if user_ids[users_data.index(u)] == assigned_to:
                    assigned_name = u["name"]
                    break
        
        lead = {
            "id": str(uuid.uuid4()),
            "name": name,
            "phone": f"+1-555-{100 + i:03d}-{1000 + i:04d}",
            "email": f"contact@{name.lower().replace(' ', '')}.com",
            "source": sources[i % len(sources)],
            "campaign": campaigns[i % len(campaigns)] if i % 2 == 0 else None,
            "city": cities[i % len(cities)],
            "status": status.value,
            "assigned_to": assigned_to,
            "assigned_name": assigned_name,
            "attempt_count": 0 if status == LeadStatus.NEW else (i % 5) + 1,
            "last_activity": created_at if status != LeadStatus.NEW else None,
            "next_followup": (datetime.now(timezone.utc) + timedelta(days=(i % 7))).isoformat() if status not in [LeadStatus.NEW, LeadStatus.CLOSED_WON, LeadStatus.CLOSED_LOST] else None,
            "notes": f"Interested in premium package. Budget: ${(i + 1) * 5000}",
            "created_at": created_at,
            "updated_at": created_at
        }
        await db.leads.insert_one(lead)
        leads_created.append(lead)
        
        # Add activity
        await add_activity(lead["id"], "Lead created", f"New lead from {lead['source']}", user_ids[0], "System")
    
    # Create bookings for closed_won leads
    closed_leads = [l for l in leads_created if l["status"] == LeadStatus.CLOSED_WON.value]
    hotels = ["Grand Hotel", "The Ritz", "Marriott", "Hilton", "Hyatt", "Four Seasons", "W Hotel", "Sheraton"]
    
    for i, lead in enumerate(closed_leads):
        booking = {
            "id": str(uuid.uuid4()),
            "lead_id": lead["id"],
            "lead_name": lead["name"],
            "hotel_name": hotels[i % len(hotels)],
            "check_in": (datetime.now(timezone.utc) + timedelta(days=10 + i)).strftime("%Y-%m-%d"),
            "check_out": (datetime.now(timezone.utc) + timedelta(days=13 + i)).strftime("%Y-%m-%d"),
            "final_price": 5000 + (i * 500),
            "bid_price": 4500 + (i * 450),
            "payment_status": PaymentStatus.PAID.value if i % 3 == 0 else (PaymentStatus.PARTIAL.value if i % 3 == 1 else PaymentStatus.UNPAID.value),
            "payment_amount": (5000 + (i * 500)) if i % 3 == 0 else ((2500 + (i * 250)) if i % 3 == 1 else 0),
            "notes": "VIP booking",
            "created_at": lead["created_at"],
            "created_by": lead["assigned_to"] or user_ids[3]
        }
        await db.bookings.insert_one(booking)
    
    # Create some call logs
    for lead in leads_created[:30]:
        if lead["attempt_count"] > 0:
            for j in range(lead["attempt_count"]):
                call = {
                    "id": str(uuid.uuid4()),
                    "lead_id": lead["id"],
                    "user_id": lead["assigned_to"] or user_ids[3],
                    "user_name": lead["assigned_name"] or "Emily Davis",
                    "outcome": list(CallOutcome)[j % len(CallOutcome)].value,
                    "duration_minutes": 5 + (j * 3),
                    "notes": f"Follow-up call #{j + 1}",
                    "next_followup": lead["next_followup"],
                    "created_at": (datetime.fromisoformat(lead["created_at"].replace("Z", "+00:00")) + timedelta(hours=j * 24)).isoformat()
                }
                await db.calls.insert_one(call)
    
    return {"message": f"Seeded {len(users_data)} users, {len(leads_created)} leads, and related data"}

# ==================== FEATURE FLAGS ====================
@api_router.get("/config/features")
async def get_feature_flags():
    return {
        "telephony_enabled": TELEPHONY_ENABLED
    }

# ==================== ROOT ====================
@api_router.get("/")
async def root():
    return {"message": "Bidinn CRM API", "version": "1.0.0"}

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

# Create indexes on startup
@app.on_event("startup")
async def create_indexes():
    # Lead indexes
    await db.leads.create_index("id", unique=True)
    await db.leads.create_index("status")
    await db.leads.create_index("assigned_to")
    await db.leads.create_index("created_at")
    await db.leads.create_index("source")
    
    # User indexes
    await db.users.create_index("id", unique=True)
    await db.users.create_index("email", unique=True)
    
    # Other indexes
    await db.calls.create_index("lead_id")
    await db.bookings.create_index("lead_id")
    await db.activities.create_index("lead_id")
    await db.notifications.create_index("user_id")
    
    logger.info("Database indexes created")
