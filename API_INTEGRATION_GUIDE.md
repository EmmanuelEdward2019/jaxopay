# JAXOPAY API Integration Guide

This guide provides a list of recommended APIs to power JAXOPAY's core features and a roadmap for integrating them into the backend.

## 1. Recommended API Providers

### 💳 Payments & Wallets (NGN, USD, GHS, KES)
*   **[Flutterwave](https://flutterwave.com/)**: The gold standard for Pan-African payments. Supports collections, payouts, and multi-currency wallets.
*   **[Paystack](https://paystack.com/)**: Excellent for NGN/GHS payments and automated payouts to bank accounts.
*   **[Chimoney](https://chimoney.io/)**: Specialized in cross-border "value" transfers (Money to Airtime, Mobile Money, Bank accounts).

### 🃏 Virtual Cards (USD/Local)
*   **[Bridgecard](https://bridgecard.co/)**: A dedicated card-issuing API that allows you to issue Mastercard/Visa virtual and physical cards.
*   **[Mono](https://mono.co/)**: Offers card issuing and direct bank access (lookup/balance) in Nigeria.
*   **[Cardtonic](https://cardtonic.com/)**: Useful for sourcing rates and understanding the retail market for virtual cards in Nigeria.

### 🪙 Cryptocurrency (BTC, ETH, USDT)
*   **[Yellow Card (Yellow Pay)](https://yellowcard.io/)**: Focused on the African market, great for USDT/NGN ramps via stablecoins.
*   **[Binance Pay API](https://www.binance.com/en/merchant)**: Best for global crypto payments if your users are already in the Binance ecosystem.
*   **[BVNK](https://bvnk.com/)**: Professional grade infrastructure for stablecoin and fiat payments.

### ✈️ Flights & Travel
*   **[Duffel](https://duffel.com/)**: The modern way to sell flights. Very clean API, supports searching, booking, and seat selection.
*   **[Amadeus for Developers](https://developers.amadeus.com/)**: The industry giant. Massive coverage but slightly more complex integration.

### 🎁 Gift Cards
*   **[Reloadly](https://www.reloadly.com/)**: One of the best APIs for Gift Cards and Airtime top-ups globally.
*   **[Cardtonic](https://cardtonic.com/)**: For the Nigerian market specifically, they are a primary endpoint for gift card trading.

---

## 2. Integration Roadmap

### Phase 1: Service Layer Setup
Create a dedicated service for each third-party API in `src/services/`.
Example: `src/services/payment.service.js`

```javascript
// Example Service Pattern
import axios from 'axios';

class FlutterwaveService {
  constructor() {
    this.client = axios.create({
      baseURL: 'https://api.flutterwave.com/v3',
      headers: { Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}` }
    });
  }

  async createVirtualCard(data) {
    const response = await this.client.post('/virtual-cards', data);
    return response.data;
  }
}
```

### Phase 2: Webhook Implementation
Most financial APIs rely on webhooks for status updates (e.g., "Card Transaction Approved" or "Transfer Successful").
1.  Create a generic webhook route: `POST /api/v1/webhooks/:provider`
2.  Verify the signature (security is critical here).
3.  Update the database based on the event.

### Phase 3: Dashboard Connection
Update the existing controllers in `src/controllers/` to call these new services instead of returning placeholder data.

---

## 3. Environment Variables Needed
Add these to your `.env` file as you sign up for providers:

```env
# Payments
FLUTTERWAVE_SECRET_KEY=...
PAYSTACK_SECRET_KEY=...

# Cards
BRIDGECARD_API_KEY=...

# Crypto
YELLOW_CARD_API_KEY=...

# Travel
DUFFEL_ACCESS_TOKEN=...

# Gift Cards
RELOADLY_CLIENT_ID=...
RELOADLY_CLIENT_SECRET=...
```

## 4. Immediate Next Steps
1.  **Select one provider** to start (e.g., Flutterwave for wallets/payments).
2.  **Sign up** for a developer account to get Test Keys.
3.  **Implement the first endpoint** (e.g., "Fund Wallet") to test the end-to-end flow.
