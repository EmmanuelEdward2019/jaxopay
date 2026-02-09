import BaseAdapter from '../../interfaces/BaseAdapter.js';

class SumsubAdapter extends BaseAdapter {
    constructor(config = {}) { super(config); this.name = 'Sumsub'; }
    async verifyUser(userId) { return { status: 'pending' }; }
}
export default SumsubAdapter;
