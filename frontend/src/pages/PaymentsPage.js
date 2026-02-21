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
  formatDateTime,
  getPaymentStatusColor,
} from '../lib/utils';
import {
  Plus,
  Loader2,
  DollarSign,
  CreditCard,
  Search,
  TrendingUp,
} from 'lucide-react';

function RecordPaymentDialog({ open, onOpenChange, bookings, onSuccess }) {
  const { api } = useAuth();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    booking_id: '',
    amount: '',
    notes: '',
  });

  // Filter unpaid or partial bookings
  const eligibleBookings = bookings.filter(b => b.payment_status !== 'paid');

  const selectedBooking = eligibleBookings.find(b => b.id === formData.booking_id);
  const remainingAmount = selectedBooking 
    ? selectedBooking.final_price - selectedBooking.payment_amount 
    : 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post('/payments', {
        ...formData,
        amount: parseFloat(formData.amount),
      });
      toast.success('Payment recorded successfully');
      onSuccess();
      onOpenChange(false);
      setFormData({ booking_id: '', amount: '', notes: '' });
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to record payment');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]" data-testid="record-payment-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5" />
            Record Payment
          </DialogTitle>
          <DialogDescription>
            Record a payment for a booking
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="booking">Booking *</Label>
              <Select
                value={formData.booking_id}
                onValueChange={(value) => setFormData({ ...formData, booking_id: value })}
                required
              >
                <SelectTrigger data-testid="payment-booking-select">
                  <SelectValue placeholder="Select booking" />
                </SelectTrigger>
                <SelectContent>
                  {eligibleBookings.map((booking) => (
                    <SelectItem key={booking.id} value={booking.id}>
                      {booking.lead_name} - {booking.hotel_name} ({formatCurrency(booking.final_price - booking.payment_amount)} remaining)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {selectedBooking && (
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800 space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total Price:</span>
                  <span className="font-medium">{formatCurrency(selectedBooking.final_price)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Already Paid:</span>
                  <span className="font-medium">{formatCurrency(selectedBooking.payment_amount)}</span>
                </div>
                <div className="flex justify-between text-sm border-t pt-1 mt-1">
                  <span className="text-muted-foreground">Remaining:</span>
                  <span className="font-medium text-primary">{formatCurrency(remainingAmount)}</span>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="amount">Amount *</Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  min="0"
                  max={remainingAmount || undefined}
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  className="pl-9"
                  placeholder="0.00"
                  required
                />
              </div>
              {remainingAmount > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setFormData({ ...formData, amount: remainingAmount.toString() })}
                >
                  Pay full amount ({formatCurrency(remainingAmount)})
                </Button>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={2}
                placeholder="Payment reference, method, etc..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !formData.booking_id || !formData.amount} data-testid="record-payment-submit">
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Record Payment
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function PaymentsPage() {
  const { api, isTeamLead } = useAuth();
  const [payments, setPayments] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [recordDialogOpen, setRecordDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchPayments();
    fetchBookings();
  }, []);

  const fetchPayments = async () => {
    try {
      const response = await api.get('/payments');
      setPayments(response.data);
    } catch (error) {
      toast.error('Failed to fetch payments');
    } finally {
      setLoading(false);
    }
  };

  const fetchBookings = async () => {
    try {
      const response = await api.get('/bookings');
      setBookings(response.data);
    } catch (error) {
      console.error('Failed to fetch bookings:', error);
    }
  };

  const handleSuccess = () => {
    fetchPayments();
    fetchBookings();
  };

  const totalCollected = payments.reduce((sum, p) => sum + p.amount, 0);
  const thisMonthPayments = payments.filter(p => {
    const paymentDate = new Date(p.created_at);
    const now = new Date();
    return paymentDate.getMonth() === now.getMonth() && paymentDate.getFullYear() === now.getFullYear();
  });
  const thisMonthTotal = thisMonthPayments.reduce((sum, p) => sum + p.amount, 0);

  return (
    <div className="space-y-6 animate-fade-in" data-testid="payments-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Payments</h1>
          <p className="text-muted-foreground">
            Track and record payment transactions
          </p>
        </div>
        {isTeamLead && (
          <Button onClick={() => setRecordDialogOpen(true)} data-testid="record-payment-btn">
            <Plus className="w-4 h-4 mr-2" />
            Record Payment
          </Button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
              <DollarSign className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Collected</p>
              <p className="text-2xl font-bold text-emerald-600">{formatCurrency(totalCollected)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-lg bg-blue-100 dark:bg-blue-900/30">
              <TrendingUp className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">This Month</p>
              <p className="text-2xl font-bold text-blue-600">{formatCurrency(thisMonthTotal)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-lg bg-purple-100 dark:bg-purple-900/30">
              <CreditCard className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Transactions</p>
              <p className="text-2xl font-bold">{payments.length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search payments..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 max-w-md"
            />
          </div>
        </CardContent>
      </Card>

      {/* Payments Table */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : payments.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <CreditCard className="w-12 h-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No payments recorded</h3>
            <p className="text-muted-foreground mb-4">
              Start by recording a payment for a booking
            </p>
            {isTeamLead && (
              <Button onClick={() => setRecordDialogOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Record Payment
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Booking</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.map((payment) => {
                const booking = bookings.find(b => b.id === payment.booking_id);
                return (
                  <TableRow key={payment.id} data-testid={`payment-row-${payment.id}`}>
                    <TableCell>{formatDateTime(payment.created_at)}</TableCell>
                    <TableCell>
                      {booking ? (
                        <div>
                          <p className="font-medium">{booking.lead_name}</p>
                          <p className="text-sm text-muted-foreground">{booking.hotel_name}</p>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">Unknown booking</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="font-semibold text-emerald-600">
                        {formatCurrency(payment.amount)}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-xs truncate">
                      {payment.notes || '-'}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Record Payment Dialog */}
      <RecordPaymentDialog
        open={recordDialogOpen}
        onOpenChange={setRecordDialogOpen}
        bookings={bookings}
        onSuccess={handleSuccess}
      />
    </div>
  );
}
