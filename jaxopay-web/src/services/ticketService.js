import apiClient from '../lib/apiClient';

const ticketService = {
    createTicket: async (ticketData) => {
        try {
            const response = await apiClient.post('/tickets', ticketData);
            return { success: true, data: response.data };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    getMyTickets: async (params = {}) => {
        try {
            const response = await apiClient.get('/tickets/my-tickets', { params });
            return { success: true, data: response.data };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    getTicketDetails: async (id) => {
        try {
            const response = await apiClient.get(`/tickets/${id}`);
            return { success: true, data: response.data };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    replyToTicket: async (id, replyData) => {
        try {
            const response = await apiClient.post(`/tickets/${id}/reply`, replyData);
            return { success: true, data: response.data };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    closeTicket: async (id) => {
        try {
            const response = await apiClient.patch(`/tickets/${id}/close`);
            return { success: true, message: response.message };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    rateTicket: async (id, rating, review_comment = '') => {
        try {
            const response = await apiClient.post(`/tickets/${id}/rate`, { rating, review_comment });
            return { success: true, message: response.message };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    // Admin: set ticket status (open / pending / in_progress / resolved / closed)
    updateStatus: async (id, status) => {
        try {
            const response = await apiClient.patch(`/tickets/${id}/status`, { status });
            return { success: true, message: response.message, data: response.data };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    // Admin
    getAllTickets: async (params = {}) => {
        try {
            const response = await apiClient.get('/tickets', { params });
            return { success: true, data: response.data };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
};

export default ticketService;
