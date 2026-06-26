import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    MessageCircle,
    Search,
    RefreshCw,
    Shield,
    User,
    Send,
    Paperclip
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import ticketService from '../../services/ticketService';
import { formatDateTime } from '../../utils/formatters';

const AdminSupport = () => {
    const { user } = useAuthStore();
    const [tickets, setTickets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedTicket, setSelectedTicket] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');

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
        const result = await ticketService.getAllTickets();
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

    const handleSetStatus = async (status) => {
        if (!selectedTicket || status === selectedTicket.status) return;
        const result = await ticketService.updateStatus(selectedTicket.id, status);
        if (result.success) {
            setSelectedTicket({ ...selectedTicket, status });
            fetchTickets();
        }
    };

    const filteredTickets = tickets.filter(t => {
        const matchesSearch = t.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
            t.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (t.email && t.email.toLowerCase().includes(searchQuery.toLowerCase()));
        const matchesStatus = statusFilter === 'all' || t.status === statusFilter;
        return matchesSearch && matchesStatus;
    });

    const getStatusStyles = (status) => {
        switch (status) {
            case 'open': return 'bg-success/10 text-success';
            case 'pending': return 'bg-primary/10 text-blue-700';
            case 'in_progress': return 'bg-amber-100 text-amber-700';
            case 'resolved': return 'bg-purple-100 text-purple-700';
            case 'closed': return 'bg-muted text-foreground/30';
            default: return 'bg-muted text-foreground';
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">
                        Ticket Management
                    </h1>
                    <p className="text-muted-foreground">
                        Manage and respond to user support requests
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Tickets List */}
                <div className="lg:col-span-1 space-y-4">
                    <div className="bg-card rounded-2xl p-4 shadow-sm border border-border">
                        <div className="relative mb-4">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <input
                                type="text"
                                placeholder="Search by subject, ID, email..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 bg-muted/50 border-none rounded-xl text-sm focus:ring-2 focus:ring-ring outline-none"
                            />
                        </div>

                        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                            {['all', 'open', 'pending', 'in_progress', 'resolved', 'closed'].map(status => (
                                <button
                                    key={status}
                                    onClick={() => setStatusFilter(status)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize whitespace-nowrap transition-colors ${statusFilter === status
                                        ? 'bg-primary text-white shadow-sm'
                                        : 'bg-muted text-muted-foreground hover:bg-muted'
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
                                <div key={i} className="bg-card rounded-2xl p-4 h-24 animate-pulse"></div>
                            ))
                        ) : filteredTickets.length === 0 ? (
                            <div className="text-center py-12 bg-card rounded-2xl border border-dashed border-border">
                                <MessageCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                                <p className="text-muted-foreground">No tickets found</p>
                            </div>
                        ) : (
                            filteredTickets.map(ticket => (
                                <button
                                    key={ticket.id}
                                    onClick={() => setSelectedTicket(ticket)}
                                    className={`w-full p-4 rounded-2xl text-left transition-all border ${selectedTicket?.id === ticket.id
                                        ? 'bg-primary/10 border-primary/20 shadow-md ring-1 ring-primary'
                                        : 'bg-card border-border hover:border-border shadow-sm'
                                        }`}
                                >
                                    <div className="flex justify-between items-start mb-2">
                                        <div className="flex flex-col gap-1">
                                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase w-fit ${getStatusStyles(ticket.status)}`}>
                                                {ticket.status}
                                            </span>
                                            <span className="text-[10px] text-primary font-bold uppercase truncate max-w-[150px]">
                                                {ticket.email}
                                            </span>
                                        </div>
                                        <p className="text-[10px] text-muted-foreground uppercase font-medium">{formatDateTime(ticket.updated_at)}</p>
                                    </div>
                                    <h4 className="font-bold text-foreground mb-1 truncate">{ticket.subject}</h4>
                                    <div className="flex items-center gap-2">
                                        <p className="text-xs text-muted-foreground uppercase tracking-tighter">ID: #{ticket.id.slice(0, 8)}</p>
                                        <span className="text-muted-foreground">•</span>
                                        <p className="text-xs text-muted-foreground capitalize">{ticket.category}</p>
                                    </div>
                                </button>
                            ))
                        )}
                    </div>
                </div>

                {/* Ticket Details / Conversation */}
                <div className="lg:col-span-2">
                    {selectedTicket ? (
                        <div className="bg-card rounded-3xl shadow-sm border border-border flex flex-col h-[700px]">
                            {/* Ticket Header */}
                            <div className="p-6 border-b border-border flex flex-wrap items-center justify-between gap-4">
                                <div>
                                    <div className="flex items-center gap-3 mb-1">
                                        <h3 className="text-xl font-bold text-foreground">{selectedTicket.subject}</h3>
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${getStatusStyles(selectedTicket.status)}`}>
                                            {selectedTicket.status}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                                        <p>User: <span className="font-medium text-foreground">{selectedTicket.email}</span></p>
                                        <span>•</span>
                                        <p>Category: <span className="font-medium text-foreground capitalize">{selectedTicket.category}</span></p>
                                        <span>•</span>
                                        <p>Priority: <span className={`font-bold ${selectedTicket.priority === 'urgent' ? 'text-red-500' :
                                            selectedTicket.priority === 'high' ? 'text-amber-500' : 'text-muted-foreground'
                                            }`}>{selectedTicket.priority}</span></p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="flex flex-col">
                                        <label className="text-[10px] font-bold uppercase text-muted-foreground mb-1">Set status</label>
                                        <select
                                            value={selectedTicket.status}
                                            onChange={(e) => handleSetStatus(e.target.value)}
                                            className="px-3 py-2 bg-muted text-foreground text-sm font-semibold rounded-xl border border-border focus:ring-2 focus:ring-ring outline-none capitalize cursor-pointer"
                                        >
                                            {['open', 'pending', 'in_progress', 'resolved', 'closed'].map((s) => (
                                                <option key={s} value={s}>{s.replace('_', ' ')}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <button
                                        onClick={() => fetchTicketDetails(selectedTicket.id)}
                                        className="p-2 mt-4 text-muted-foreground hover:text-primary transition-colors"
                                    >
                                        <RefreshCw className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>

                            {/* Messages Area */}
                            <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-muted/30">
                                {ticketMessages.map((msg, idx) => {
                                    const isFromUser = msg.sender_id === selectedTicket.user_id;
                                    const isStaff = ['admin', 'super_admin', 'compliance_officer'].includes(msg.role);
                                    
                                    // In admin view, staff messages are on the right, user messages on the left.
                                    const isSelf = isStaff;

                                    return (
                                        <div key={msg.id} className={`flex ${isSelf ? 'justify-end' : 'justify-start'}`}>
                                            <div className={`max-w-[80%] flex gap-3 ${isSelf ? 'flex-row-reverse' : 'flex-row'}`}>
                                                <div className="shrink-0">
                                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isSelf ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'
                                                        }`}>
                                                        {isSelf ? <Shield className="w-4 h-4" /> : <User className="w-4 h-4" />}
                                                    </div>
                                                </div>
                                                <div>
                                                    <div className={`p-4 rounded-2xl ${isSelf
                                                        ? 'bg-primary text-white rounded-tr-none'
                                                        : 'bg-card text-foreground border border-border rounded-tl-none shadow-sm'
                                                        }`}>
                                                        <p className="text-sm border-white leading-relaxed">{msg.message}</p>
                                                    </div>
                                                    <p className={`text-[10px] mt-1 text-muted-foreground ${isSelf ? 'text-right' : 'text-left'}`}>
                                                        {isSelf ? (msg.role === 'compliance_officer' ? 'Compliance Team' : 'System Admin') : selectedTicket.email} • {formatDateTime(msg.created_at)}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Reply Box */}
                            <div className="p-6 border-t border-border bg-card">
                                {selectedTicket.status === 'closed' ? (
                                    <div className="bg-muted/30 rounded-2xl p-4 text-center">
                                        <p className="text-muted-foreground text-sm">This ticket is closed and cannot be replied to.</p>
                                    </div>
                                ) : (
                                    <form onSubmit={handleReply} className="relative">
                                        <textarea
                                            value={replyMessage}
                                            onChange={(e) => setReplyMessage(e.target.value)}
                                            placeholder="Write your response to the user..."
                                            className="w-full bg-muted/50 border-none rounded-xl p-4 pr-16 text-sm resize-none focus:ring-2 focus:ring-ring outline-none h-24"
                                            disabled={isReplying}
                                        />
                                        <div className="absolute right-4 bottom-4 flex items-center gap-2">
                                            <button
                                                type="button"
                                                className="p-2 text-muted-foreground hover:text-muted-foreground"
                                            >
                                                <Paperclip className="w-5 h-5" />
                                            </button>
                                            <button
                                                type="submit"
                                                disabled={isReplying || !replyMessage.trim()}
                                                className="p-2 bg-primary hover:bg-primary/90 text-white rounded-xl transition-all disabled:opacity-50 disabled:scale-95"
                                            >
                                                <Send className="w-5 h-5" />
                                            </button>
                                        </div>
                                    </form>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="h-[700px] bg-card rounded-3xl border border-dashed border-border flex flex-col items-center justify-center p-12 text-center">
                            <div className="w-32 h-32 bg-primary/10 rounded-full flex items-center justify-center mb-6">
                                <MessageCircle className="w-16 h-16 text-primary" />
                            </div>
                            <h3 className="text-2xl font-bold text-foreground mb-2">Select a Ticket</h3>
                            <p className="text-muted-foreground max-w-sm">
                                Choose a ticket from the list on the left to view the conversation and respond to the user.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AdminSupport;
