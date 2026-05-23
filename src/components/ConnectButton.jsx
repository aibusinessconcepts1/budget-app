import { useState } from 'react';

const EXCHANGE_WEBHOOK = 'https://hook.us1.make.com/ojtth1kjrrmpzinfxn4m2fna2eanuc5k';

function ConnectButton({ onConnected }) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');

  const handleClick = async () => {
    console.log('Connect button clicked');
    setLoading(true);
    setStatus('Getting link token...');

    try {
      // Get link token from our API
      const res = await fetch('/api/link-token');
      console.log('Link token response status:', res.status);
      const data = await res.json();
      console.log('Link token data:', data);

      if (data.error) throw new Error(data.error);

      // Load Plaid Link via script tag approach
      const handler = window.Plaid.create({
        token: data.link_token,
        onSuccess: async (public_token) => {
          setStatus('Saving connection...');
          await fetch(EXCHANGE_WEBHOOK, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ public_token }),
          });
          setStatus('✓ Bank connected!');
          if (onConnected) onConnected();
          setLoading(false);
        },
        onExit: (err) => {
          setStatus(err ? 'Error: ' + err.display_message : '');
          setLoading(false);
        },
      });

      handler.open();
    } catch (err) {
      console.error('Connect error:', err);
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
