import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import TradeDashboard from '../../components/crypto/TradeDashboard';
import walletService from '../../services/walletService';

const Trade = () => {
  const { pair } = useParams();
  const [wallets, setWallets] = useState([]);

  useEffect(() => {
    walletService.getWallets().then(res => {
      if (res.success) setWallets(Array.isArray(res.data) ? res.data : res.data?.data || []);
    }).catch(() => {});
  }, []);

  return (
    <TradeDashboard
      wallets={wallets}
      initialMarket={pair || 'usdtngn'}
    />
  );
};

export default Trade;
