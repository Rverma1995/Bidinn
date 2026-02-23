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
  DollarSign,
  Search,
} from 'lucide-react';

function CreateBookingDialog({ open, onOpenChange, leads, onSuccess }) {
  const { api } = useAuth();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    lead_id: '',
    hotel_name: '',
    check_in: '',
    check_out: '',
    final_price: '',
    bid_price: '',
    notes: '',
  });

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
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="final_price">Final Price *</Label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="final_price"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.final_price}
                    onChange={(e) => setFormData({ ...formData, final_price: e.target.value })}
                    className="pl-9"
                    placeholder="0.00"
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="bid_price">Bid Price</Label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="bid_price"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.bid_price}
                    onChange={(e) => setFormData({ ...formData, bid_price: e.target.value })}
                    className="pl-9"
                    placeholder="0.00"
                  />
                </div>
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
  const { api } = useAuth();
  const [bookings, setBookings] = useState([]);
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    fetchBookings();
    fetchLeads();
  }, [statusFilter]);

  const fetchBookings = async () => {
    try {
      const params = new URLSearchParams();
      if (statusFilter && statusFilter !== 'all') params.append('payment_status', statusFilter);
      const response = await api.get(`/bookings?${params.toString()}`);
      setBookings(response.data);
    } catch (error) {
      toast.error('Failed to fetch bookings');
    } finally {
      setLoading(false);
    }
  };

  const fetchLeads = async () => {
    try {
      const response = await api.get('/leads');
      setLeads(response.data);
    } catch (error) {
      console.error('Failed to fetch leads:', error);
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
              <DollarSign className="w-5 h-5 text-emerald-600" />
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
              <DollarSign className="w-5 h-5 text-amber-600" />
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
                <TableHead>Price</TableHead>
                <TableHead>Collected</TableHead>
                <TableHead>Status</TableHead>
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
                  <TableCell>{formatCurrency(booking.payment_amount)}</TableCell>
                  <TableCell>
                    <Badge className={getPaymentStatusColor(booking.payment_status)}>
                      {booking.payment_status.charAt(0).toUpperCase() + booking.payment_status.slice(1)}
                    </Badge>
                  </TableCell>
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
    </div>
  );
}
