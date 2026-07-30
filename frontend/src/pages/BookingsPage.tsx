import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Textarea } from '../components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { toast } from 'sonner';
import {
  formatCurrency,
  formatDate,
  getPaymentStatusColor,
} from '../lib/utils';
import {
  Plus,
  Loader2,
  Calendar,
  Building,
  IndianRupee,
  Search,
  MoreVertical,
  Pencil,
  Trash2,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog';

function CreateBookingDialog({ open, onOpenChange, leads, onSuccess }) {
  const { api } = useAuth();
  const [loading, setLoading] = useState(false);
  const [bookingReasons, setBookingReasons] = useState([]);
  const [formData, setFormData] = useState({
    lead_id: '',
    hotel_name: '',
    check_in: '',
    check_out: '',
    final_price: '',
    bid_price: '',
    notes: '',
    booking_reason: '',
  });

  useEffect(() => {
    fetchBookingReasons();
  }, []);

  const fetchBookingReasons = async () => {
    try {
      const response = await api.get('/bookings/reasons');
      setBookingReasons(response.data);
    } catch (error) {
      console.error('Failed to fetch booking reasons:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post('/bookings', {
        ...formData,
        final_price: parseFloat(formData.final_price),
        bid_price: parseFloat(formData.bid_price),
      });
      toast.success('Booking created successfully');
      onSuccess();
      onOpenChange(false);
      setFormData({
        lead_id: '',
        hotel_name: '',
        check_in: '',
        check_out: '',
        final_price: '',
        bid_price: '',
        notes: '',
        booking_reason: '',
      });
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create booking');
    } finally {
      setLoading(false);
    }
  };

  // Filter leads that are not yet closed
  const eligibleLeads = leads.filter(l => !['closed_won', 'closed_lost'].includes(l.status));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]" data-testid="create-booking-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building className="w-5 h-5" />
            Create Booking
          </DialogTitle>
          <DialogDescription>
            Create a new booking and close the deal
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="lead">Lead *</Label>
              <Select
                value={formData.lead_id}
                onValueChange={(value) => setFormData({ ...formData, lead_id: value })}
                required
              >
                <SelectTrigger data-testid="booking-lead-select">
                  <SelectValue placeholder="Select lead" />
                </SelectTrigger>
                <SelectContent>
                  {eligibleLeads.map((lead) => (
                    <SelectItem key={lead.id} value={lead.id}>
                      {lead.name} - {lead.phone}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="hotel">Hotel Name *</Label>
              <Input
                id="hotel"
                value={formData.hotel_name}
                onChange={(e) => setFormData({ ...formData, hotel_name: e.target.value })}
                placeholder="e.g., Grand Hotel"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="check_in">Check-in *</Label>
                <Input
                  id="check_in"
                  type="date"
                  value={formData.check_in}
                  onChange={(e) => setFormData({ ...formData, check_in: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="check_out">Check-out *</Label>
                <Input
                  id="check_out"
                  type="date"
                  value={formData.check_out}
                  onChange={(e) => setFormData({ ...formData, check_out: e.target.value })}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="amount_received">Package Amount (₹) *</Label>
              <div className="relative">
                <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="amount_received"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.final_price}
                  onChange={(e) => setFormData({ ...formData, final_price: e.target.value, bid_price: e.target.value })}
                  className="pl-9"
                  placeholder="0.00"
                  required
                  data-testid="booking-amount-input"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={2}
                placeholder="Additional booking details..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="booking_reason">Booking Reason</Label>
              <Select
                value={formData.booking_reason}
                onValueChange={(value) => setFormData({ ...formData, booking_reason: value })}
              >
                <SelectTrigger data-testid="booking-reason-select">
                  <SelectValue placeholder="Select reason (optional)" />
                </SelectTrigger>
                <SelectContent>
                  {bookingReasons.map((reason) => (
                    <SelectItem key={reason} value={reason}>
                      {reason}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !formData.lead_id} data-testid="create-booking-submit">
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Create Booking
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function BookingsPage() {
  const { api, user } = useAuth();
  const [bookings, setBookings] = useState([]);
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [bookingReasons, setBookingReasons] = useState([]);
  const [editLoading, setEditLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const isAdmin = user?.role === 'admin';
  const isManager = user?.role === 'manager';
  const canEditDelete = isAdmin || isManager;

  useEffect(() => {
    fetchBookings();
    fetchLeads();
    fetchBookingReasons();
  }, [statusFilter]);

  const fetchBookings = async () => {
    try {
      const params = new URLSearchParams();
      if (statusFilter && statusFilter !== 'all') params.append('payment_status', statusFilter);
      params.append('limit', '1000'); // Get all bookings
      const response = await api.get(`/bookings?${params.toString()}`);
      // Handle both paginated and non-paginated response formats
      const bookingsData = response.data.bookings || response.data;
      setBookings(bookingsData);
    } catch (error) {
      toast.error('Failed to fetch bookings');
    } finally {
      setLoading(false);
    }
  };

  const fetchLeads = async () => {
    try {
      const response = await api.get('/leads?compact=true&limit=1000');
      // Handle both paginated and non-paginated response formats
      const leadsData = response.data.leads || response.data;
      setLeads(leadsData);
    } catch (error) {
      console.error('Failed to fetch leads:', error);
    }
  };

  const fetchBookingReasons = async () => {
    try {
      const response = await api.get('/bookings/reasons');
      setBookingReasons(response.data);
    } catch (error) {
      console.error('Failed to fetch booking reasons:', error);
    }
  };

  const handleEditBooking = async (formData) => {
    if (!selectedBooking) return;
    setEditLoading(true);
    try {
      await api.put(`/bookings/${selectedBooking.id}`, formData);
      toast.success('Booking updated successfully');
      setEditDialogOpen(false);
      setSelectedBooking(null);
      fetchBookings();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update booking');
    } finally {
      setEditLoading(false);
    }
  };

  const handleDeleteBooking = async () => {
    if (!selectedBooking) return;
    setDeleteLoading(true);
    try {
      await api.delete(`/bookings/${selectedBooking.id}`);
      toast.success('Booking deleted successfully');
      setDeleteDialogOpen(false);
      setSelectedBooking(null);
      fetchBookings();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete booking');
    } finally {
      setDeleteLoading(false);
    }
  };

  const filteredBookings = bookings.filter(b =>
    b.lead_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    b.hotel_name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalRevenue = bookings.reduce((sum, b) => sum + (parseFloat(b.payment_amount) || 0), 0);
  const pendingRevenue = bookings.reduce((sum, b) => sum + ((parseFloat(b.final_price) || 0) - (parseFloat(b.payment_amount) || 0)), 0);

  return (
    <div className="space-y-6 animate-fade-in" data-testid="bookings-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Bookings</h1>
          <p className="text-muted-foreground">
            Manage hotel bookings and track revenue
          </p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)} data-testid="create-booking-btn">
          <Plus className="w-4 h-4 mr-2" />
          New Booking
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
              <IndianRupee className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Collected Revenue</p>
              <p className="text-2xl font-bold text-emerald-600">{formatCurrency(totalRevenue)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-lg bg-amber-100 dark:bg-amber-900/30">
              <IndianRupee className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Pending Revenue</p>
              <p className="text-2xl font-bold text-amber-600">{formatCurrency(pendingRevenue)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-lg bg-blue-100 dark:bg-blue-900/30">
              <Calendar className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Bookings</p>
              <p className="text-2xl font-bold">{bookings.length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search bookings..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select
              value={statusFilter}
              onValueChange={setStatusFilter}
            >
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="unpaid">Unpaid</SelectItem>
                <SelectItem value="partial">Partial</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Bookings Table */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : filteredBookings.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Building className="w-12 h-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No bookings found</h3>
            <p className="text-muted-foreground mb-4">
              Create a new booking to get started
            </p>
            <Button onClick={() => setCreateDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Create Booking
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lead</TableHead>
                <TableHead>Hotel</TableHead>
                <TableHead>Check-in</TableHead>
                <TableHead>Check-out</TableHead>
                <TableHead>Total Amount</TableHead>
                <TableHead>Payment Received</TableHead>
                <TableHead>Status</TableHead>
                {canEditDelete && <TableHead className="w-[50px]">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredBookings.map((booking) => (
                <TableRow key={booking.id} className="table-row-interactive" data-testid={`booking-row-${booking.id}`}>
                  <TableCell className="font-medium">{booking.lead_name}</TableCell>
                  <TableCell>{booking.hotel_name}</TableCell>
                  <TableCell>{formatDate(booking.check_in)}</TableCell>
                  <TableCell>{formatDate(booking.check_out)}</TableCell>
                  <TableCell>{formatCurrency(booking.final_price)}</TableCell>
                  <TableCell>{formatCurrency(booking.payment_amount || 0)}</TableCell>
                  <TableCell>
                    <Badge className={getPaymentStatusColor(booking.payment_status)}>
                      {booking.payment_status.charAt(0).toUpperCase() + booking.payment_status.slice(1)}
                    </Badge>
                  </TableCell>
                  {canEditDelete && (
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8" data-testid={`booking-actions-${booking.id}`}>
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem 
                            onClick={() => {
                              setSelectedBooking(booking);
                              setEditDialogOpen(true);
                            }}
                          >
                            <Pencil className="w-4 h-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            className="text-red-600"
                            onClick={() => {
                              setSelectedBooking(booking);
                              setDeleteDialogOpen(true);
                            }}
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Create Booking Dialog */}
      <CreateBookingDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        leads={leads}
        onSuccess={fetchBookings}
      />

      {/* Edit Booking Dialog */}
      {selectedBooking && (
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Edit Booking</DialogTitle>
              <DialogDescription>Update booking details for {selectedBooking.lead_name}</DialogDescription>
            </DialogHeader>
            <form onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.target);
              handleEditBooking({
                hotel_name: formData.get('hotel_name'),
                check_in: formData.get('check_in'),
                check_out: formData.get('check_out'),
                final_price: formData.get('final_price'),
                bid_price: formData.get('final_price'),
                notes: formData.get('notes'),
                booking_reason: formData.get('booking_reason'),
              });
            }}>
              <div className="grid gap-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="edit_hotel_name">Hotel/Property Name</Label>
                  <Input
                    id="edit_hotel_name"
                    name="hotel_name"
                    defaultValue={selectedBooking.hotel_name}
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit_check_in">Check-in Date</Label>
                    <Input
                      id="edit_check_in"
                      name="check_in"
                      type="date"
                      defaultValue={selectedBooking.check_in?.split('T')[0]}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit_check_out">Check-out Date</Label>
                    <Input
                      id="edit_check_out"
                      name="check_out"
                      type="date"
                      defaultValue={selectedBooking.check_out?.split('T')[0]}
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit_final_price">Total Amount (INR)</Label>
                  <div className="relative">
                    <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="edit_final_price"
                      name="final_price"
                      type="number"
                      min="0"
                      defaultValue={selectedBooking.final_price}
                      className="pl-9"
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit_booking_reason">Booking Reason</Label>
                  <Select name="booking_reason" defaultValue={selectedBooking.booking_reason || ''}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select reason (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      {bookingReasons.map((reason) => (
                        <SelectItem key={reason} value={reason}>
                          {reason}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit_notes">Notes</Label>
                  <Textarea
                    id="edit_notes"
                    name="notes"
                    defaultValue={selectedBooking.notes || ''}
                    rows={2}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={editLoading}>
                  {editLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Save Changes
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Booking</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the booking for "{selectedBooking?.lead_name}" at {selectedBooking?.hotel_name}? 
              This action cannot be undone and will also affect payment records.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteBooking}
              className="bg-red-600 hover:bg-red-700"
              disabled={deleteLoading}
            >
              {deleteLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
