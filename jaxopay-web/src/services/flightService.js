import apiClient from '../lib/apiClient';

const flightService = {
  // Search flights
  searchFlights: async (searchParams) => {
    try {
      const response = await apiClient.get('/flights/search', {
        params: searchParams,
      });
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Book flight
  bookFlight: async (bookingData) => {
    try {
      const response = await apiClient.post('/flights/book', bookingData);
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Get user bookings
  getBookings: async (params = {}) => {
    try {
      const response = await apiClient.get('/flights/bookings', {
        params,
      });
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Get single booking
  getBooking: async (bookingId) => {
    try {
      const response = await apiClient.get(`/flights/bookings/${bookingId}`);
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Cancel booking
  cancelBooking: async (bookingId) => {
    try {
      const response = await apiClient.delete(`/flights/bookings/${bookingId}`);
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
};

export default flightService;

