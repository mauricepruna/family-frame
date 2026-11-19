// Submits the Eufy email/SMS 2FA code to the local eufy-security-ws, then lists devices.
// Usage: node verify-code.mjs 123456
const code = process.argv[2];
if (!/^\d{4,8}$/.test(code || '')) { console.error('usage: node verify-code.mjs <code>'); process.exit(1); }
const ws = new WebSocket(process.env.EUFY_WS || 'ws://localhost:3000');
const send = (o) => ws.send(JSON.stringify(o));
ws.onopen = () => {
  send({ messageId: 'schema', command: 'set_api_schema', schemaVersion: 21 });
  send({ messageId: 'listen', command: 'start_listening' });
  send({ messageId: 'verify', command: 'driver.set_verify_code', verifyCode: code });
};
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.messageId === 'verify') console.log('verify:', JSON.stringify(m));
  const devs = m.type === 'result' && m.result && m.result.state && m.result.state.devices;
  if (devs) devs.forEach((d) => console.log('device:', d.serialNumber, d.model, d.name));
};
setTimeout(() => { ws.close(); process.exit(0); }, 20000);
