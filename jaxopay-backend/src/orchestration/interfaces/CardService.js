class CardServiceInterface {
    async createCard(params) { throw new Error('Not implemented'); }
    async fundCard(params) { throw new Error('Not implemented'); }
    async withdrawFromCard(params) { throw new Error('Not implemented'); }
    async freezeCard(cardId) { throw new Error('Not implemented'); }
    async unfreezeCard(cardId) { throw new Error('Not implemented'); }
    async terminateCard(cardId) { throw new Error('Not implemented'); }
    async getTransactions(cardId) { throw new Error('Not implemented'); }
    async status(cardId) { throw new Error('Not implemented'); }
}
export default CardServiceInterface;
