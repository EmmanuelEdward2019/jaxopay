import BaseAdapter from '../../interfaces/BaseAdapter.js';

class WiseAdapter extends BaseAdapter {
    constructor(config = {}) { super(config); this.name = 'Wise'; }
    async execute(params) { return { success: true, transactionId: 'wise-' + Date.now() }; }
}
export default WiseAdapter;
