import ngrok from "ngrok";

const PORT = parseInt(process.env.PORT || "3000", 10);

async function startTunnel() {
  const url = await ngrok.connect({
    addr: PORT,
    authtoken: process.env.NGROK_AUTHTOKEN,
  });

  console.log(`\n  ngrok tunnel open:`);
  console.log(`  ${url}\n`);
  console.log(`  Razorpay webhook URL:`);
  console.log(`  ${url}/api/webhooks/razorpay\n`);
  console.log(`  Paste the URL above into Razorpay Dashboard → Webhooks → Add New Webhook`);
  console.log(`  Select event: payment.failed\n`);
  console.log(`  Press Ctrl+C to stop the tunnel.\n`);
}

startTunnel().catch((err) => {
  console.error("Failed to start ngrok tunnel:", err.message);
  process.exit(1);
});
