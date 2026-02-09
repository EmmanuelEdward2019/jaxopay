import BaseAdapter from '../../interfaces/BaseAdapter.js';

class KorapayAdapter extends BaseAdapter {
    constructor(config = {}) {
        super(config);
        this.name = 'Korapay';
    }
    async execute(params) { return { success: true, transactionId: 'kor-' + Date.now() }; }
    async status(reference) { return { status: 'completed' }; }
}
export default KorapayAdapter;
