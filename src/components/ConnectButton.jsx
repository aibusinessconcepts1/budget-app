import { useState, useCallback, useEffect } from 'react';
import { usePlaidLink } from 'react-plaid-link';

const EXCHANGE_WEBHOOK = 'https://hook.us1.make.com/ojtth1kjrrmpzinfxn4m2fna2eanuc5k';

function ConnectButton({ onConnected }) {
  const [linkToken, setLinkToken] = useState(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');

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

  // Open Plaid Link as soon as we have a token and it's ready
  useEffect(() => {
    if (linkToken && ready) {
      open();
    }
  }, [linkToken, ready, open]);

  const handleClick = async () => {
    console.log('Connect button clicked');
    setLoading(true);
    setStatus('Getting link token...');
    try {
      console.log('Fetching link token...');
      const res = await fetch('/api/link-token');
      console.log('Response status:', res.status);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setLinkToken(data.link_token);
    } catch (err) {
      setStatus('Error: ' + err.message);
      setLoading(false);
    }
  };

  return (
    <div className="connect-button-wrap">
      <button
        className="connect-btn"
        onClick={handleClick}
        disabled={loading}
      >
        {loading ? 'Connecting...' : '+ Connect Bank'}
      </button>
      {status && <p className="connect-status">{status}</p>}
    </div>
  );
}

export default ConnectButton;
