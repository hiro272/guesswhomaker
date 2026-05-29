export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const orderNumber = String(Math.floor(Math.random() * 9000) + 1000);
    return res.status(200).json({
      success: true,
      orderNumber,
      cardsUrl: '',
      boardUrl: '',
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
