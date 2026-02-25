import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    MessageCircle,
    Plus,
    Search,
    Filter,
    ChevronRight,
    Clock,
    CheckCircle2,
    AlertCircle,
    X,
    Send,
    Paperclip,
    User,
    Shield,
    RefreshCw
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import ticketService from '../../services/ticketService';
import { formatDateTime } from '../../utils/formatters';

const Support = () => {
    const { user } = useAuthStore();
    const isAdmin = ['admin', 'super_admin', 'compliance_officer'].includes(user?.role);

    const [tickets, setTickets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedTicket, setSelectedTicket] = useState(null);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');

    // Create ticket state
    const [subject, setSubject] = useState('');
    const [category, setCategory] = useState('technical');
    const [priority, setPriority] = useState('medium');
    const [message, setMessage] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Reply state
    const [replyMessage, setReplyMessage] = useState('');
    const [isReplying, setIsReplying] = useState(false);
    const [ticketMessages, setTicketMessages] = useState([]);

    useEffect(() => {
        fetchTickets();
    }, []);

    useEffect(() => {
        if (selectedTicket) {
            fetchTicketDetails(selectedTicket.id);
        }
    }, [selectedTicket]);

    const fetchTickets = async () => {
        setLoading(true);
        const result = isAdmin
            ? await ticketService.getAllTickets()
            : await ticketService.getMyTickets();

        if (result.success) {
            setTickets(result.data);
        }
        setLoading(false);
    };

    const fetchTicketDetails = async (id) => {
        const result = await ticketService.getTicketDetails(id);
        if (result.success) {
            setTicketMessages(result.data.messages);
        }
    };

    const handleCreateTicket = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        const result = await ticketService.createTicket({ subject, category, priority, description: message });
        if (result.success) {
            setShowCreateModal(false);
            fetchTickets();
            // Reset form
            setSubject('');
            setCategory('technical');
            setPriority('medium');
            setMessage('');
        }
        setIsSubmitting(false);
    };

    const handleReply = async (e) => {
        e.preventDefault();
        if (!replyMessage.trim()) return;

        setIsReplying(true);
        const result = await ticketService.replyToTicket(selectedTicket.id, { message: replyMessage });
        if (result.success) {
            setReplyMessage('');
            fetchTicketDetails(selectedTicket.id);
            fetchTickets(); // Refresh the list to show updated timestamp/status
        }
        setIsReplying(false);
    };

    const handleCloseTicket = async (id) => {
        const result = await ticketService.closeTicket(id);
        if (result.success) {
            fetchTickets();
            if (selectedTicket?.id === id) {
                setSelectedTicket({ ...selectedTicket, status: 'closed' });
            }
        }
    };

    const filteredTickets = tickets.filter(t => {
        const matchesSearch = t.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
            t.id.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesStatus = statusFilter === 'all' || t.status === statusFilter;
        return matchesSearch && matchesStatus;
    });

    const getStatusStyles = (status) => {
        switch (status) {
            case 'open': return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
            case 'pending': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
            case 'resolved': return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400';
            case 'closed': return 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400';
            default: return 'bg-gray-100 text-gray-700';
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                        {isAdmin ? 'Ticket Management' : 'Support Tickets'}
                    </h1>
                    <p className="text-gray-600 dark:text-gray-400">
                        {isAdmin ? 'Manage and respond to user support requests' : 'Get help from our support team'}
                    </p>
                </div>
                {!isAdmin && (
                    <button
                        onClick={() => setShowCreateModal(true)}
                        className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-accent-600 hover:bg-accent-700 text-white font-bold rounded-2xl transition-all shadow-lg shadow-accent-500/20"
                    >
                        <Plus className="w-5 h-5" />
                        New Ticket
                    </button>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Tickets List */}
                <div className="lg:col-span-1 space-y-4">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
                        <div className="relative mb-4">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Search tickets..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 bg-gray-50 dark:bg-gray-700/50 border-none rounded-xl text-sm focus:ring-2 focus:ring-accent-500 outline-none"
                            />
                        </div>

                        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                            {['all', 'open', 'pending', 'resolved', 'closed'].map(status => (
                                <button
                                    key={status}
                                    onClick={() => setStatusFilter(status)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize whitespace-nowrap transition-colors ${statusFilter === status
                                        ? 'bg-accent-600 text-white shadow-sm'
                                        : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200'
                                        }`}
                                >
                                    {status}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-3">
                        {loading ? (
                            Array(3).fill(0).map((_, i) => (
                                <div key={i} className="bg-white dark:bg-gray-800 rounded-2xl p-4 h-24 animate-pulse"></div>
                            ))
                        ) : filteredTickets.length === 0 ? (
                            <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-2xl border border-dashed border-gray-200 dark:border-gray-700">
                                <MessageCircle className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                                <p className="text-gray-500 dark:text-gray-400">No tickets found</p>
                            </div>
                        ) : (
                            filteredTickets.map(ticket => (
                                <button
                                    key={ticket.id}
                                    onClick={() => setSelectedTicket(ticket)}
                                    className={`w-full p-4 rounded-2xl text-left transition-all border ${selectedTicket?.id === ticket.id
                                        ? 'bg-accent-50 dark:bg-accent-900/10 border-accent-200 dark:border-accent-800 shadow-md ring-1 ring-accent-500'
                                        : 'bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700 hover:border-gray-200 dark:hover:border-gray-600 shadow-sm'
                                        }`}
                                >
                                    <div className="flex justify-between items-start mb-2">
                                        <div className="flex flex-col gap-1">
                                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase w-fit ${getStatusStyles(ticket.status)}`}>
                                                {ticket.status}
                                            </span>
                                            {isAdmin && (
                                                <span className="text-[10px] text-accent-600 font-bold uppercase truncate max-w-[100px]">
                                                    {ticket.email}
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-[10px] text-gray-400 uppercase font-medium">{formatDateTime(ticket.updated_at)}</p>
                                    </div>
                                    <h4 className="font-bold text-gray-900 dark:text-white mb-1 truncate">{ticket.subject}</h4>
                                    <div className="flex items-center gap-2">
                                        <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-tighter">ID: #{ticket.id.slice(0, 8)}</p>
                                        <span className="text-gray-300">•</span>
                                        <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">{ticket.category}</p>
                                    </div>
                                </button>
                            ))
                        )}
                    </div>
                </div>

                {/* Ticket Details / Conversation */}
                <div className="lg:col-span-2">
                    {selectedTicket ? (
                        <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col h-[700px]">
                            {/* Ticket Header */}
                            <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex flex-wrap items-center justify-between gap-4">
                                <div>
                                    <div className="flex items-center gap-3 mb-1">
                                        <h3 className="text-xl font-bold text-gray-900 dark:text-white">{selectedTicket.subject}</h3>
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${getStatusStyles(selectedTicket.status)}`}>
                                            {selectedTicket.status}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-3 text-sm text-gray-500">
                                        <p>Category: <span className="font-medium text-gray-700 dark:text-gray-300 capitalize">{selectedTicket.category}</span></p>
                                        <span>•</span>
                                        <p>Priority: <span className={`font-bold ${selectedTicket.priority === 'urgent' ? 'text-red-500' :
                                            selectedTicket.priority === 'high' ? 'text-amber-500' : 'text-gray-500'
                                            }`}>{selectedTicket.priority}</span></p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    {selectedTicket.status !== 'closed' && (
                                        <button
                                            onClick={() => handleCloseTicket(selectedTicket.id)}
                                            className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-sm font-bold rounded-xl hover:bg-gray-200 transition-colors"
                                        >
                                            Close Ticket
                                        </button>
                                    )}
                                    <button
                                        onClick={() => fetchTicketDetails(selectedTicket.id)}
                                        className="p-2 text-gray-400 hover:text-accent-500 transition-colors"
                                    >
                                        <RefreshCw className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>

                            {/* Messages Area */}
                            <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-gray-50/30 dark:bg-gray-900/10">
                                {ticketMessages.map((msg, idx) => {
                                    const isFromUser = msg.sender_id === selectedTicket.user_id;
                                    const isStaff = ['admin', 'super_admin', 'compliance_officer'].includes(msg.role);

                                    return (
                                        <div key={msg.id} className={`flex ${isFromUser ? 'justify-end' : 'justify-start'}`}>
                                            <div className={`max-w-[80%] flex gap-3 ${isFromUser ? 'flex-row-reverse' : 'flex-row'}`}>
                                                <div className="shrink-0">
                                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isStaff ? 'bg-accent-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-500'
                                                        }`}>
                                                        {isStaff ? <Shield className="w-4 h-4" /> : <User className="w-4 h-4" />}
                                                    </div>
                                                </div>
                                                <div>
                                                    <div className={`p-4 rounded-2xl ${isFromUser
                                                        ? 'bg-accent-600 text-white rounded-tr-none'
                                                        : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border border-gray-100 dark:border-gray-700 rounded-tl-none shadow-sm'
                                                        }`}>
                                                        <p className="text-sm border-white leading-relaxed">{msg.message}</p>
                                                    </div>
                                                    <p className={`text-[10px] mt-1 text-gray-400 ${isFromUser ? 'text-right' : 'text-left'}`}>
                                                        {isStaff ? (msg.role === 'compliance_officer' ? 'Compliance Team' : 'System Admin') : (isFromUser ? 'You' : 'User')} • {formatDateTime(msg.created_at)}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Reply Box */}
                            <div className="p-6 border-t border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800">
                                {selectedTicket.status === 'closed' ? (
                                    <div className="bg-gray-50 dark:bg-gray-700/30 rounded-2xl p-4 text-center">
                                        <p className="text-gray-500 dark:text-gray-400 text-sm">This ticket is closed and cannot be replied to.</p>
                                    </div>
                                ) : (
                                    <form onSubmit={handleReply} className="relative">
                                        <textarea
                                            value={replyMessage}
                                            onChange={(e) => setReplyMessage(e.target.value)}
                                            placeholder="Write your reply here..."
                                            className="w-full bg-gray-50 dark:bg-gray-700/50 border-none rounded-xl p-4 pr-16 text-sm resize-none focus:ring-2 focus:ring-accent-500 outline-none h-24"
                                            disabled={isReplying}
                                        />
                                        <div className="absolute right-4 bottom-4 flex items-center gap-2">
                                            <button
                                                type="button"
                                                className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                                            >
                                                <Paperclip className="w-5 h-5" />
                                            </button>
                                            <button
                                                type="submit"
                                                disabled={isReplying || !replyMessage.trim()}
                                                className="p-2 bg-accent-600 hover:bg-accent-700 text-white rounded-xl transition-all disabled:opacity-50 disabled:scale-95"
                                            >
                                                <Send className="w-5 h-5" />
                                            </button>
                                        </div>
                                    </form>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="h-[700px] bg-white dark:bg-gray-800 rounded-3xl border border-dashed border-gray-200 dark:border-gray-700 flex flex-col items-center justify-center p-12 text-center">
                            <div className="w-32 h-32 bg-accent-50 dark:bg-accent-900/10 rounded-full flex items-center justify-center mb-6">
                                <MessageCircle className="w-16 h-16 text-accent-500" />
                            </div>
                            <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Select a Ticket</h3>
                            <p className="text-gray-500 dark:text-gray-400 max-w-sm">
                                Choose a ticket from the list on the left to view the conversation, or create a new one to get assistance.
                            </p>
                            <button
                                onClick={() => setShowCreateModal(true)}
                                className="mt-8 px-8 py-3 bg-accent-600 text-white font-bold rounded-2xl hover:bg-accent-700 transition-all shadow-lg shadow-accent-500/20"
                            >
                                Create New Ticket
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Create Ticket Modal */}
            <AnimatePresence>
                {showCreateModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowCreateModal(false)}>
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-xl overflow-hidden shadow-2xl"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="p-8">
                                <div className="flex items-center justify-between mb-8">
                                    <h3 className="text-2xl font-bold text-gray-900 dark:text-white">New Support Ticket</h3>
                                    <button onClick={() => setShowCreateModal(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors">
                                        <X className="w-6 h-6 text-gray-400" />
                                    </button>
                                </div>

                                <form onSubmit={handleCreateTicket} className="space-y-6">
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Subject</label>
                                        <input
                                            type="text"
                                            required
                                            value={subject}
                                            onChange={(e) => setSubject(e.target.value)}
                                            placeholder="What can we help you with?"
                                            className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700/50 border-none rounded-2xl focus:ring-2 focus:ring-primary-500 outline-none"
                                        />
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Category</label>
                                            <select
                                                value={category}
                                                onChange={(e) => setCategory(e.target.value)}
                                                className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700/50 border-none rounded-2xl focus:ring-2 focus:ring-accent-500 outline-none"
                                            >
                                                <option value="technical">Technical Issue</option>
                                                <option value="billing">Billing & Payouts</option>
                                                <option value="kyc">KYC Verification</option>
                                                <option value="exchange">Exchange & Swaps</option>
                                                <option value="other">Other</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Priority</label>
                                            <select
                                                value={priority}
                                                onChange={(e) => setPriority(e.target.value)}
                                                className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700/50 border-none rounded-2xl focus:ring-2 focus:ring-accent-500 outline-none"
                                            >
                                                <option value="low">Low</option>
                                                <option value="medium">Medium</option>
                                                <option value="high">High</option>
                                                <option value="urgent">Urgent</option>
                                            </select>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Message</label>
                                        <textarea
                                            required
                                            value={message}
                                            onChange={(e) => setMessage(e.target.value)}
                                            placeholder="Please provide details about your issue..."
                                            className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700/50 border-none rounded-2xl focus:ring-2 focus:ring-primary-500 outline-none h-32 resize-none"
                                        />
                                    </div>

                                    <div className="bg-accent-50 dark:bg-accent-900/10 p-4 rounded-2xl flex items-start gap-3">
                                        <Shield className="w-5 h-5 text-accent-600 mt-0.5" />
                                        <p className="text-xs text-accent-700 dark:text-accent-300">
                                            Our support team usually responds within 2-4 hours. For urgent matters, please use the high priority flag.
                                        </p>
                                    </div>

                                    <div className="flex gap-4">
                                        <button
                                            type="button"
                                            onClick={() => setShowCreateModal(false)}
                                            className="flex-1 py-4 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-bold rounded-2xl hover:bg-gray-200 transition-all"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={isSubmitting}
                                            className="flex-1 py-4 bg-accent-600 text-white font-bold rounded-2xl hover:bg-accent-700 transition-all shadow-lg shadow-accent-500/20 disabled:opacity-50"
                                        >
                                            {isSubmitting ? 'Submitting...' : 'Submit Ticket'}
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default Support;
