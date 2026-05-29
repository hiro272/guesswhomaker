import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  const { order, type } = req.query;
  if (!order || !type) return res.status(400).send('Missing params');

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  const { data: orderData } = await supabase.from('orders').select('*').eq('order_number', order).single();
  const { data: peopleData } = await supabase.from('people').select('*').eq('order_number', order).order('slot');

  if (!orderData || !peopleData) return res.status(404).send('Order not found');

  const peopleWithBase64 = await Promise.all(peopleData.map(async p => {
    let base64 = '';
    if (p.photo_url) {
      try {
        const imgRes = await fetch(p.photo_url);
        const buf = await imgRes.arrayBuffer();
        base64 = `data:image/jpeg;base64,${Buffer.from(buf).toString('base64')}`;
      } catch (_) {}
    }
    return { ...p, base64 };
  }));

  const html = type === 'cards'
    ? generateCards(peopleWithBase64, orderData.game_title, order)
    : generateBoard(peopleWithBase64, orderData.game_title, order);

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).send(html);
}

function generateCards(people, gameTitle, orderNumber) {
  const cards = people.map((p, i) => `
    <div class="card">
      <div class="card-photo">
        ${p.base64
          ? `<img src="${p.base64}" alt="${p.name}">`
          : `<div class="no-photo">${i+1}</div>`}
      </div>
      <div class="card-name">${p.name}</div>
    </div>`).join('');

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <style>
    @page { size: letter portrait; margin: 8mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; background: white; }
    .header { text-align: center; margin-bottom: 5mm; padding-bottom: 3mm; border-bottom: 1px solid #eee; }
    .header h1 { font-size: 14pt; font-weight: 800; }
    .header h1 span { color: #8ab020; }
    .header p { font-size: 8pt; color: #999; margin-top: 2px; }
    .grid {
      display: grid;
      grid-template-columns: repeat(4, 50mm);
      gap: 4mm;
      justify-content: center;
    }
    .card {
      width: 50mm;
      height: 75mm;
      border: 0.8px solid #bbb;
      border-radius: 0;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      page-break-inside: avoid;
    }
    .card-photo {
      flex: 1;
      background: #f5f5f0;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .card-photo img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      object-position: center top;
      display: block;
    }
    .no-photo {
      font-size: 18pt;
      color: #ddd;
    }
    .card-name {
      font-size: 7pt;
      font-weight: 700;
      text-align: center;
      padding: 1.5mm 1mm;
      color: #111;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      border-top: 0.5px solid #ddd;
      background: white;
      flex-shrink: 0;
    }
    .footer { margin-top: 4mm; font-size: 7pt; color: #aaa; text-align: center; }
  </style></head><body>
  <div class="header">
    <h1>Guess<span>Who</span>.maker — Cards</h1>
    <p>${gameTitle || 'Family Guess Who'} · Order #${orderNumber} · 50mm × 75mm · Print on 200g+ cardstock · Cut along borders</p>
  </div>
  <div class="grid">${cards}</div>
  <div class="footer">✂️ Cut along borders · 24 cards · GuessWho.maker · Order #${orderNumber}</div>
  <script>window.onload = () => setTimeout(() => window.print(), 800);<\/script>
  </body></html>`;
}

function generateBoard(people, gameTitle, orderNumber) {
  const slots = people.map((p, i) => `
    <div class="slot">
      <div class="slot-photo">
        ${p.base64
          ? `<img src="${p.base64}" alt="${p.name}">`
          : `<div class="no-photo">${i+1}</div>`}
      </div>
      <div class="slot-name">${p.name}</div>
      <div class="slot-flap"></div>
    </div>`).join('');

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <style>
    @page { size: letter landscape; margin: 6mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; background: white; }
    .header {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 3mm; padding-bottom: 2mm; border-bottom: 1.5px solid #111;
    }
    .header h1 { font-size: 12pt; font-weight: 800; }
    .header h1 span { color: #8ab020; }
    .header p { font-size: 7pt; color: #999; }
    .board {
      display: grid;
      grid-template-columns: repeat(6, 24mm);
      grid-template-rows: repeat(4, 40mm);
      gap: 2.5mm;
      justify-content: center;
    }
    .slot {
      width: 24mm;
      height: 40mm;
      border: 1px solid #333;
      border-radius: 0;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    .slot-photo {
      flex: 1;
      background: #f0ede8;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .slot-photo img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      object-position: center top;
      display: block;
    }
    .no-photo {
      font-size: 12pt;
      color: #ddd;
    }
    .slot-name {
      font-size: 5pt;
      font-weight: 700;
      text-align: center;
      padding: 1mm 0.5mm;
      background: white;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      color: #111;
      border-top: 0.5px solid #ccc;
      flex-shrink: 0;
    }
    .slot-flap {
      height: 7mm;
      background: #111;
      border-top: 1px solid #000;
      flex-shrink: 0;
    }
    .footer {
      margin-top: 3mm;
      display: flex;
      justify-content: space-between;
      font-size: 6pt;
      color: #aaa;
    }
  </style></head><body>
  <div class="header">
    <div>
      <h1>Guess<span>Who</span>.maker — Board</h1>
      <p style="font-size:7pt;color:#999">${gameTitle || 'Family Guess Who'} · Order #${orderNumber}</p>
    </div>
    <p style="font-size:7pt;color:#999;text-align:right">6 × 4 grid · Slot 24mm × 40mm · Letter landscape</p>
  </div>
  <div class="board">${slots}</div>
  <div class="footer">
    <span>GuessWho.maker · Order #${orderNumber}</span>
    <span>Black flap covers eliminated players</span>
  </div>
  <script>window.onload = () => setTimeout(() => window.print(), 800);<\/script>
  </body></html>`;
}
