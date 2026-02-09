import BaseAdapter from '../../interfaces/BaseAdapter.js';

class VTpassAdapter extends BaseAdapter {
    constructor(config = {}) {
        super(config);
        this.name = 'VTpass';
    }
    async getProviders(category) {
        console.log(`[ORCHESTRATION] VTpass Mock: Fetching providers for ${category}`);
        return [
            { id: 'dstv', name: 'DSTV', service_type: 'tv' },
            { id: 'gotv', name: 'GOTV', service_type: 'tv' },
            { id: 'mtn', name: 'MTN Airtime', service_type: 'airtime' },
            { id: 'glo', name: 'Glo Data', service_type: 'data' },
            { id: 'ikeja-electric', name: 'Ikeja Electric', service_type: 'electricity' }
        ].filter(p => !category || p.service_type === category);
    }
}
export default VTpassAdapter;
