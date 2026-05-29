// api/generate-print.js
// Gera o HTML de impressão na hora, direto pelo Vercel
// URL: /api/generate-print?order=0004&type=cards

import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  const { order, type } = req.query;
  if (!order || !type) return res.status(400).send('Missing params');

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  // Get order + people from DB
  const { data: orderData } = await supabase.from('orders').select('*').eq('order_number', order).single();
  const { data: peopleData } = await supabase.from('people').select('*').eq('order_number', order).order('slot');

  if (!orderData || !peopleData) return res.status(404).send('Order not found');

  // Fetch each photo and convert to base64
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
      <div class="card-num">#${String(i+1).padStart(2,'0')}</div>
      <div class="card-photo">
        ${p.base64
          ? `<img src="${p.base64}" alt="${p.name}">`
          : `<div class="no-photo">${i+1}</div>`}
      </div>
      <div class="card-name">${p.name}</div>
      <div class="card-brand">GuessWho.maker</div>
    </div>`).join('');

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <style>
    @page { size: letter portrait; margin: 10mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; background: white; }
    .header { text-align: center; margin-bottom: 6mm; padding-bottom: 3mm; border-bottom: 1px solid #eee; }
    .header h1 { font-size: 15pt; font-weight: 800; }
    .header h1 span { color: #8ab020; }
    .header p { font-size: 8pt; color: #999; margin-top: 2px; }
    .grid { display: grid; grid-template-columns: repeat(4, 50mm); grid-template-rows: repeat(3, 75mm); gap: 4mm; justify-content: center; }
    .card { width: 50mm; height: 75mm; border: 1px solid #ccc; border-radius: 4mm; overflow: hidden; display: flex; flex-direction: column; page-break-inside: avoid; }
    .card-num { font-size: 6pt; color: #bbb; text-align: right; padding: 1.5mm 2mm 0; font-family: monospace; }
    .card-photo { flex: 1; background: #f5f5f0; overflow: hidden; }
    .card-photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .no-photo { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 18pt; color: #ddd; }
    .card-name { font-size: 7.5pt; font-weight: 700; text-align: center; padding: 1.5mm 1mm 1mm; color: #111; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; border-top: 0.5px solid #eee; }
    .card-brand { font-size: 5.5pt; color: #ccc; text-align: center; padding-bottom: 1.5mm; }
    .footer { margin-top: 5mm; font-size: 7pt; color: #aaa; text-align: center; }
  </style></head><body>
  <div class="header">
    <h1>Guess<span>Who</span>.maker — Cards</h1>
    <p>${gameTitle || 'Family Guess Who'} · Order #${orderNumber} · 50mm × 75mm · Print on 200g+ cardstock</p>
  </div>
  <div class="grid">${cards}</div>
  <div class="footer">✂️ Cut along card borders · 24 cards total · GuessWho.maker</div>
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
    @page { size: letter landscape; margin: 8mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; background: white; }
    .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4mm; padding-bottom: 3mm; border-bottom: 2px solid #111; }
    .header h1 { font-size: 14pt; font-weight: 800; }
    .header h1 span { color: #8ab020; }
    .board { display: grid; grid-template-columns: repeat(6, 24mm); grid-template-rows: repeat(4, 40mm); gap: 3mm; justify-content: center; }
    .slot { width: 24mm; height: 40mm; border: 1.5px solid #222; border-radius: 2mm; overflow: hidden; display: flex; flex-direction: column; }
    .slot-photo { flex: 1; background: #f0ede8; overflow: hidden; }
    .slot-photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .no-photo { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 12pt; color: #ddd; }
    .slot-name { font-size: 5.5pt; font-weight: 700; text-align: center; padding: 1mm 0.5mm; background: white; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #111; border-top: 0.5px solid #ddd; }
    .slot-flap { height: 8mm; background: #0c0c0b; border-top: 1px solid #222; }
    .footer { margin-top: 4mm; display: flex; justify-content: space-between; font-size: 6.5pt; color: #aaa; }
  </style></head><body>
  <div class="header">
    <div><h1>Guess<span>Who</span>.maker — Board</h1><p>${gameTitle || 'Family Guess Who'} · Order #${orderNumber}</p></div>
    <p style="font-size:7pt;color:#999;text-align:right">6 × 4 · Slot 24mm × 40mm · Letter landscape</p>
  </div>
  <div class="board">${slots}</div>
  <div class="footer">
    <span>GuessWho.maker · Game Board</span>
    <span>Black flap covers eliminated players</span>
  </div>
  <script>window.onload = () => setTimeout(() => window.print(), 800);<\/script>
  </body></html>`;
}
