import BaseAdapter from '../../interfaces/BaseAdapter.js';

class StrowalletAdapter extends BaseAdapter {
    constructor(config = {}) {
        super(config);
        this.name = 'Strowallet';
    }
    async createCard(params) {
        console.log(`[ORCHESTRATION] Strowallet Mock: Creating card for user ${params.userId}`);
        const cardNum = '5399' + Math.random().toString().slice(2, 14);
        return {
            success: true,
            cardId: 'str-' + Date.now(),
            card_number: cardNum,
            cvv: '321',
            expiry: '12/26',
            status: 'active'
        };
    }
}
export default StrowalletAdapter;
