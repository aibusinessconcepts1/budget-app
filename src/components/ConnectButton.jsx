import { useState, useCallback } from 'react';
import { usePlaidLink } from 'react-plaid-link';

const EXCHANGE_WEBHOOK = 'https://hook.us1.make.com/ojtth1kjrrmpzinfxn4m2fna2eanuc5k';

function ConnectButton({ onConnected }) {
  const [linkToken, setLinkToken] = useState(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');

  const fetchLinkToken = async () => {
    setLoading(true);
    setStatus('Getting link token...');
    try {
      const res = await fetch('/api/link-token');
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setLinkToken(data.link_token);
    } catch (err) {
      setStatus('Error: ' + err.message);
      setLoading(false);
    }
  };

  const onSuccess = useCallback(async (public_token) => {
    setStatus('Saving connection...');
    try {
      await fetch(EXCHANGE_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ public_token }),
      });
      setStatus('✓ Bank connected!');
      setLinkToken(null);
      if (onConnected) onConnected();
    } catch (err) {
      setStatus('Error: ' + err.message);
    }
    setLoading(false);
  }, [onConnected]);

  const onExit = useCallback((err) => {
    setStatus(err ? 'Error: ' + err.display_message : '');
    setLinkToken(null);
    setLoading(false);
  }, []);

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess,
    onExit,
  });

  // Auto-open Plaid Link once we have the token
  if (linkToken && ready) {
    open();
  }

  return (
    <div className="connect-button-wrap">
      <button
        className="connect-btn"
        onClick={fetchLinkToken}
        disabled={loading}
      >
        {loading ? 'Connecting...' : '+ Connect Bank'}
      </button>
      {status && <p className="connect-status">{status}</p>}
    </div>
  );
}

export default ConnectButton;
