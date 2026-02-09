import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Plane,
    Search,
    Calendar,
    Users,
    ArrowRightLeft,
    MapPin,
    Clock,
    Luggage,
    X,
    Check,
    AlertTriangle,
    RefreshCw,
    ChevronRight,
    Ticket,
} from 'lucide-react';
import flightService from '../../services/flightService';
import walletService from '../../services/walletService';
import { formatCurrency, formatDate, formatDateTime } from '../../utils/formatters';

const CABIN_CLASSES = [
    { value: 'economy', label: 'Economy' },
    { value: 'premium_economy', label: 'Premium Economy' },
    { value: 'business', label: 'Business' },
    { value: 'first', label: 'First Class' },
];

const Flights = () => {
    const [step, setStep] = useState(1); // 1: Search, 2: Results, 3: Passengers, 4: Pay, 5: Confirm
    const [tripType, setTripType] = useState('roundtrip'); // 'oneway' or 'roundtrip'
    const [searchForm, setSearchForm] = useState({
        origin: '',
        destination: '',
        departDate: '',
        returnDate: '',
        passengers: 1,
        cabinClass: 'economy',
    });
    const [loading, setLoading] = useState(false);
    const [flights, setFlights] = useState([]);
    const [selectedFlight, setSelectedFlight] = useState(null);
    const [passengerDetails, setPassengerDetails] = useState([]);
    const [wallets, setWallets] = useState([]);
    const [selectedWallet, setSelectedWallet] = useState('');
    const [bookings, setBookings] = useState([]);
    const [showBookingsTab, setShowBookingsTab] = useState(false);
    const [bookingSuccess, setBookingSuccess] = useState(null);
    const [error, setError] = useState('');

    useEffect(() => {
        fetchWallets();
        fetchBookings();
    }, []);

    const fetchWallets = async () => {
        const result = await walletService.getWallets();
        if (result.success) {
            setWallets(result.data.wallets || []);
        }
    };

    const fetchBookings = async () => {
        const result = await flightService.getBookings();
        if (result.success) {
            setBookings(result.data.bookings || []);
        }
    };

    const handleSearch = async () => {
        if (!searchForm.origin || !searchForm.destination || !searchForm.departDate) {
            setError('Please fill in all required fields');
            return;
        }
        setLoading(true);
        setError('');
        const result = await flightService.searchFlights({
            origin: searchForm.origin,
            destination: searchForm.destination,
            depart_date: searchForm.departDate,
            return_date: tripType === 'roundtrip' ? searchForm.returnDate : undefined,
            passengers: searchForm.passengers,
            cabin_class: searchForm.cabinClass,
        });
        if (result.success) {
            setFlights(result.data.flights || []);
            setStep(2);
        } else {
            setError(result.error || 'Failed to search flights');
        }
        setLoading(false);
    };

    const handleSelectFlight = (flight) => {
        setSelectedFlight(flight);
        // Initialize passenger details array
        const passengers = Array.from({ length: searchForm.passengers }, (_, i) => ({
            first_name: '',
            last_name: '',
            email: '',
            phone: '',
            date_of_birth: '',
            passport_number: '',
        }));
        setPassengerDetails(passengers);
        setStep(3);
    };

    const handlePassengerChange = (index, field, value) => {
        const updated = [...passengerDetails];
        updated[index] = { ...updated[index], [field]: value };
        setPassengerDetails(updated);
    };

    const handleProceedToPayment = () => {
        // Validate all passengers have required info
        for (const p of passengerDetails) {
            if (!p.first_name || !p.last_name || !p.email) {
                setError('Please fill in all passenger details');
                return;
            }
        }
        setError('');
        setStep(4);
    };

    const handleBookFlight = async () => {
        if (!selectedWallet) {
            setError('Please select a wallet');
            return;
        }
        setLoading(true);
        setError('');
        const result = await flightService.bookFlight({
            flight_id: selectedFlight.id,
            wallet_id: selectedWallet,
            passengers: passengerDetails,
        });
        if (result.success) {
            setBookingSuccess(result.data);
            fetchBookings();
            fetchWallets();
            setStep(5);
        } else {
            setError(result.error || 'Booking failed');
        }
        setLoading(false);
    };

    const handleCancelBooking = async (bookingId) => {
        if (!confirm('Are you sure you want to cancel this booking?')) return;
        const result = await flightService.cancelBooking(bookingId);
        if (result.success) {
            fetchBookings();
        }
    };

    const resetSearch = () => {
        setStep(1);
        setFlights([]);
        setSelectedFlight(null);
        setPassengerDetails([]);
        setError('');
        setBookingSuccess(null);
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Flights</h1>
                    <p className="text-gray-600 dark:text-gray-400">Search and book flights worldwide</p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => setShowBookingsTab(false)}
                        className={`px-4 py-2 rounded-lg font-medium ${!showBookingsTab
                            ? 'bg-primary-600 text-white'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                            }`}
                    >
                        Book Flight
                    </button>
                    <button
                        onClick={() => setShowBookingsTab(true)}
                        className={`px-4 py-2 rounded-lg font-medium ${showBookingsTab
                            ? 'bg-primary-600 text-white'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                            }`}
                    >
                        My Bookings ({bookings.length})
                    </button>
                </div>
            </div>

            {error && (
                <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl flex items-center gap-3">
                    <AlertTriangle className="w-5 h-5 text-red-600" />
                    <p className="text-red-700 dark:text-red-300">{error}</p>
                </div>
            )}

            {/* My Bookings Tab */}
            {showBookingsTab && (
                <div className="card">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">My Bookings</h2>
                        <button onClick={fetchBookings} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                            <RefreshCw className="w-5 h-5 text-gray-500" />
                        </button>
                    </div>
                    {bookings.length === 0 ? (
                        <div className="text-center py-12">
                            <Ticket className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                            <h3 className="text-lg font-medium text-gray-900 dark:text-white">No bookings yet</h3>
                            <p className="text-gray-500 mb-4">Book your first flight to get started</p>
                            <button
                                onClick={() => setShowBookingsTab(false)}
                                className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-lg"
                            >
                                Search Flights
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {bookings.map((booking) => (
                                <div
                                    key={booking.id}
                                    className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl border border-gray-200 dark:border-gray-600"
                                >
                                    <div className="flex items-start justify-between">
                                        <div className="flex items-center gap-4">
                                            <div className="p-3 bg-primary-100 dark:bg-primary-900/30 rounded-xl">
                                                <Plane className="w-6 h-6 text-primary-600" />
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <span className="font-semibold text-gray-900 dark:text-white">
                                                        {booking.origin}
                                                    </span>
                                                    <ArrowRightLeft className="w-4 h-4 text-gray-400" />
                                                    <span className="font-semibold text-gray-900 dark:text-white">
                                                        {booking.destination}
                                                    </span>
                                                </div>
                                                <p className="text-sm text-gray-500 mt-1">
                                                    {formatDate(booking.departure_date)} • {booking.passengers?.length || 1} passenger(s)
                                                </p>
                                                <p className="text-sm text-gray-500">
                                                    Booking ref: {booking.reference || booking.id?.slice(0, 8)}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <span className={`px-2.5 py-1 text-xs font-medium rounded-full ${booking.status === 'confirmed' ? 'bg-primary-100 text-primary-700' :
                                                booking.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                                                    'bg-yellow-100 text-yellow-700'
                                                }`}>
                                                {booking.status}
                                            </span>
                                            <p className="font-semibold text-gray-900 dark:text-white mt-2">
                                                {formatCurrency(booking.total_price, booking.currency || 'USD')}
                                            </p>
                                            {booking.status === 'confirmed' && (
                                                <button
                                                    onClick={() => handleCancelBooking(booking.id)}
                                                    className="text-sm text-red-600 hover:text-red-700 mt-2"
                                                >
                                                    Cancel
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Book Flight Flow */}
            {!showBookingsTab && (
                <>
                    {/* Progress Steps */}
                    {step > 1 && step < 5 && (
                        <div className="flex items-center gap-2 mb-4">
                            {['Search', 'Results', 'Passengers', 'Payment'].map((label, idx) => (
                                <div key={label} className="flex items-center gap-2">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${step > idx + 1 ? 'bg-primary-600 text-white' :
                                        step === idx + 1 ? 'bg-primary-600 text-white' :
                                            'bg-gray-200 dark:bg-gray-700 text-gray-500'
                                        }`}>
                                        {step > idx + 1 ? <Check className="w-4 h-4" /> : idx + 1}
                                    </div>
                                    {idx < 3 && <div className={`w-12 h-0.5 ${step > idx + 1 ? 'bg-primary-600' : 'bg-gray-200 dark:bg-gray-700'}`} />}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Step 1: Search */}
                    {step === 1 && (
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="card"
                        >
                            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">Search Flights</h2>

                            {/* Trip Type */}
                            <div className="flex gap-4 mb-6">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="radio"
                                        checked={tripType === 'roundtrip'}
                                        onChange={() => setTripType('roundtrip')}
                                        className="w-4 h-4 text-primary-600"
                                    />
                                    <span className="text-gray-700 dark:text-gray-300">Round Trip</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="radio"
                                        checked={tripType === 'oneway'}
                                        onChange={() => setTripType('oneway')}
                                        className="w-4 h-4 text-primary-600"
                                    />
                                    <span className="text-gray-700 dark:text-gray-300">One Way</span>
                                </label>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">From</label>
                                    <div className="relative">
                                        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                        <input
                                            type="text"
                                            placeholder="City or airport"
                                            value={searchForm.origin}
                                            onChange={(e) => setSearchForm({ ...searchForm, origin: e.target.value.toUpperCase() })}
                                            className="w-full pl-10 pr-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">To</label>
                                    <div className="relative">
                                        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                        <input
                                            type="text"
                                            placeholder="City or airport"
                                            value={searchForm.destination}
                                            onChange={(e) => setSearchForm({ ...searchForm, destination: e.target.value.toUpperCase() })}
                                            className="w-full pl-10 pr-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Depart</label>
                                    <div className="relative">
                                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                        <input
                                            type="date"
                                            value={searchForm.departDate}
                                            onChange={(e) => setSearchForm({ ...searchForm, departDate: e.target.value })}
                                            className="w-full pl-10 pr-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl"
                                        />
                                    </div>
                                </div>
                                {tripType === 'roundtrip' && (
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Return</label>
                                        <div className="relative">
                                            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                            <input
                                                type="date"
                                                value={searchForm.returnDate}
                                                onChange={(e) => setSearchForm({ ...searchForm, returnDate: e.target.value })}
                                                className="w-full pl-10 pr-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl"
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Passengers</label>
                                    <div className="relative">
                                        <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                        <select
                                            value={searchForm.passengers}
                                            onChange={(e) => setSearchForm({ ...searchForm, passengers: parseInt(e.target.value) })}
                                            className="w-full pl-10 pr-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl"
                                        >
                                            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                                                <option key={n} value={n}>{n} Passenger{n > 1 ? 's' : ''}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Cabin Class</label>
                                    <select
                                        value={searchForm.cabinClass}
                                        onChange={(e) => setSearchForm({ ...searchForm, cabinClass: e.target.value })}
                                        className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl"
                                    >
                                        {CABIN_CLASSES.map((c) => (
                                            <option key={c.value} value={c.value}>{c.label}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <button
                                onClick={handleSearch}
                                disabled={loading}
                                className="w-full py-3 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-xl flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                {loading ? (
                                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
                                ) : (
                                    <>
                                        <Search className="w-5 h-5" />
                                        Search Flights
                                    </>
                                )}
                            </button>
                        </motion.div>
                    )}

                    {/* Step 2: Results */}
                    {step === 2 && (
                        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                                    {flights.length} flight{flights.length !== 1 ? 's' : ''} found
                                </h2>
                                <button onClick={resetSearch} className="text-primary-600 hover:text-primary-700 font-medium">
                                    New Search
                                </button>
                            </div>
                            {flights.length === 0 ? (
                                <div className="card text-center py-12">
                                    <Plane className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                                    <h3 className="text-lg font-medium text-gray-900 dark:text-white">No flights found</h3>
                                    <p className="text-gray-500 mb-4">Try different dates or destinations</p>
                                    <button onClick={resetSearch} className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-lg">
                                        Modify Search
                                    </button>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {flights.map((flight) => (
                                        <div key={flight.id} className="card hover:shadow-md transition-shadow">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-6">
                                                    <div className="text-center">
                                                        <p className="text-2xl font-bold text-gray-900 dark:text-white">{flight.departure_time}</p>
                                                        <p className="text-sm text-gray-500">{flight.origin}</p>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-12 h-px bg-gray-300" />
                                                        <div className="text-center">
                                                            <Clock className="w-4 h-4 text-gray-400 mx-auto" />
                                                            <p className="text-xs text-gray-500">{flight.duration}</p>
                                                        </div>
                                                        <div className="w-12 h-px bg-gray-300" />
                                                    </div>
                                                    <div className="text-center">
                                                        <p className="text-2xl font-bold text-gray-900 dark:text-white">{flight.arrival_time}</p>
                                                        <p className="text-sm text-gray-500">{flight.destination}</p>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-xl font-bold text-primary-600">
                                                        {formatCurrency(flight.price, flight.currency || 'USD')}
                                                    </p>
                                                    <p className="text-sm text-gray-500">per person</p>
                                                    <button
                                                        onClick={() => handleSelectFlight(flight)}
                                                        className="mt-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-lg"
                                                    >
                                                        Select
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-4 mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 text-sm text-gray-500">
                                                <span>{flight.airline}</span>
                                                <span>•</span>
                                                <span>{flight.flight_number}</span>
                                                <span>•</span>
                                                <span className="flex items-center gap-1">
                                                    <Luggage className="w-4 h-4" />
                                                    {flight.baggage_allowance || 'Check allowance'}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </motion.div>
                    )}

                    {/* Step 3: Passenger Details */}
                    {step === 3 && selectedFlight && (
                        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="card">
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Passenger Details</h2>
                                <button onClick={() => setStep(2)} className="text-gray-500 hover:text-gray-700">
                                    ← Back to results
                                </button>
                            </div>

                            <div className="space-y-6">
                                {passengerDetails.map((passenger, idx) => (
                                    <div key={idx} className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                                        <h3 className="font-medium text-gray-900 dark:text-white mb-4">Passenger {idx + 1}</h3>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <input
                                                type="text"
                                                placeholder="First Name *"
                                                value={passenger.first_name}
                                                onChange={(e) => handlePassengerChange(idx, 'first_name', e.target.value)}
                                                className="px-4 py-3 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg"
                                            />
                                            <input
                                                type="text"
                                                placeholder="Last Name *"
                                                value={passenger.last_name}
                                                onChange={(e) => handlePassengerChange(idx, 'last_name', e.target.value)}
                                                className="px-4 py-3 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg"
                                            />
                                            <input
                                                type="email"
                                                placeholder="Email *"
                                                value={passenger.email}
                                                onChange={(e) => handlePassengerChange(idx, 'email', e.target.value)}
                                                className="px-4 py-3 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg"
                                            />
                                            <input
                                                type="tel"
                                                placeholder="Phone"
                                                value={passenger.phone}
                                                onChange={(e) => handlePassengerChange(idx, 'phone', e.target.value)}
                                                className="px-4 py-3 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg"
                                            />
                                            <input
                                                type="date"
                                                placeholder="Date of Birth"
                                                value={passenger.date_of_birth}
                                                onChange={(e) => handlePassengerChange(idx, 'date_of_birth', e.target.value)}
                                                className="px-4 py-3 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg"
                                            />
                                            <input
                                                type="text"
                                                placeholder="Passport Number"
                                                value={passenger.passport_number}
                                                onChange={(e) => handlePassengerChange(idx, 'passport_number', e.target.value)}
                                                className="px-4 py-3 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg"
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <button
                                onClick={handleProceedToPayment}
                                className="w-full mt-6 py-3 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-xl flex items-center justify-center gap-2"
                            >
                                Continue to Payment
                                <ChevronRight className="w-5 h-5" />
                            </button>
                        </motion.div>
                    )}

                    {/* Step 4: Payment */}
                    {step === 4 && selectedFlight && (
                        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="card">
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Payment</h2>
                                <button onClick={() => setStep(3)} className="text-gray-500 hover:text-gray-700">
                                    ← Back
                                </button>
                            </div>

                            {/* Flight Summary */}
                            <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl mb-6">
                                <h3 className="font-medium text-gray-900 dark:text-white mb-3">Flight Summary</h3>
                                <div className="flex items-center gap-4">
                                    <Plane className="w-6 h-6 text-primary-600" />
                                    <div>
                                        <p className="font-semibold text-gray-900 dark:text-white">
                                            {selectedFlight.origin} → {selectedFlight.destination}
                                        </p>
                                        <p className="text-sm text-gray-500">
                                            {selectedFlight.departure_time} - {selectedFlight.arrival_time} • {selectedFlight.airline}
                                        </p>
                                    </div>
                                </div>
                                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-600 flex justify-between">
                                    <span className="text-gray-600 dark:text-gray-400">
                                        {searchForm.passengers} × {formatCurrency(selectedFlight.price, selectedFlight.currency || 'USD')}
                                    </span>
                                    <span className="font-bold text-gray-900 dark:text-white">
                                        Total: {formatCurrency(selectedFlight.price * searchForm.passengers, selectedFlight.currency || 'USD')}
                                    </span>
                                </div>
                            </div>

                            {/* Wallet Selection */}
                            <div className="mb-6">
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Pay from Wallet
                                </label>
                                <select
                                    value={selectedWallet}
                                    onChange={(e) => setSelectedWallet(e.target.value)}
                                    className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl"
                                >
                                    <option value="">Select a wallet</option>
                                    {wallets.map((w) => (
                                        <option key={w.id} value={w.id}>
                                            {w.currency} Wallet - {formatCurrency(w.balance, w.currency)}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <button
                                onClick={handleBookFlight}
                                disabled={loading || !selectedWallet}
                                className="w-full py-3 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-xl flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                {loading ? (
                                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
                                ) : (
                                    <>
                                        <Check className="w-5 h-5" />
                                        Confirm Booking
                                    </>
                                )}
                            </button>
                        </motion.div>
                    )}

                    {/* Step 5: Success */}
                    {step === 5 && bookingSuccess && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="card text-center py-8"
                        >
                            <div className="w-16 h-16 bg-primary-100 dark:bg-primary-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                                <Check className="w-8 h-8 text-primary-600" />
                            </div>
                            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Booking Confirmed!</h2>
                            <p className="text-gray-600 dark:text-gray-400 mb-4">
                                Your flight has been booked successfully
                            </p>
                            <p className="text-sm text-gray-500 mb-6">
                                Reference: <span className="font-mono font-semibold">{bookingSuccess.reference || bookingSuccess.id?.slice(0, 8)}</span>
                            </p>
                            <div className="flex gap-4 justify-center">
                                <button
                                    onClick={resetSearch}
                                    className="px-6 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-medium rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
                                >
                                    Book Another Flight
                                </button>
                                <button
                                    onClick={() => setShowBookingsTab(true)}
                                    className="px-6 py-2 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-lg"
                                >
                                    View My Bookings
                                </button>
                            </div>
                        </motion.div>
                    )}
                </>
            )}
        </div>
    );
};

export default Flights;
