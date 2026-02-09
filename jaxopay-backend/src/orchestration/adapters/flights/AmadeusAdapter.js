import BaseAdapter from '../../interfaces/BaseAdapter.js';

class AmadeusAdapter extends BaseAdapter {
    constructor(config = {}) { super(config); this.name = 'Amadeus'; }
    async search(params) { return []; }
    async execute(params) { return { success: true, bookingId: 'flight-' + Date.now() }; }
}
export default AmadeusAdapter;
