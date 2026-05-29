import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { fields, files } = await parseFormData(req);
    const { clientName, clientPhone, gameTitle } = fields;
    const people = JSON.parse(fields.people || '[]');

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    const resend = new Resend(process.env.RESEND_API_KEY);

    // Order number
    const { count } = await supabase.from('orders').select('*', { count: 'exact', head: true });
    const orderNumber = String((count || 0) + 1).padStart(4, '0');

    // Upload photos
    const photoUrls = {};
    for (const [key, file] of Object.entries(files)) {
      const slotId = key.replace('photo_', '');
      const path = `orders/${orderNumber}/slot_${slotId}.jpg`;
      const { error } = await supabase.storage.from('Photos').upload(path, file.buffer, { contentType: 'image/jpeg', upsert: true });
      if (!error) {
        const { data } = supabase.storage.from('Photos').getPublicUrl(path);
        photoUrls[slotId] = data.publicUrl;
      }
    }

    // Save to DB
    await supabase.from('orders').insert({
      order_number: orderNumber, client_name: clientName, client_phone: clientPhone,
      game_title: gameTitle, status: 'complete', photos_count: Object.keys(photoUrls).length,
      created_at: new Date().toISOString(),
    });
    await supabase.from('people').insert(
      people.map(p => ({ order_number: orderNumber, slot: p.id, name: p.name, photo_url: photoUrls[String(p.id)] || null }))
    );

    // Generate print files
    const cardsHtml = generateCardsPDF(people, photoUrls, gameTitle, orderNumber);
    const boardHtml = generateBoardPDF(people, photoUrls, gameTitle, orderNumber);

    const cardsPath = `orders/${orderNumber}/cards.html`;
    const boardPath = `orders/${orderNumber}/board.html`;

    await supabase.storage.from('PDFS').upload(cardsPath, Buffer.from(cardsHtml), { contentType: 'text/html', upsert: true });
    await supabase.storage.from('PDFS').upload(boardPath, Buffer.from(boardHtml), { contentType: 'text/html', upsert: true });

    const { data: cardsData } = supabase.storage.from('PDFS').getPublicUrl(cardsPath);
    const { data: boardData } = supabase.storage.from('PDFS').getPublicUrl(boardPath);
    const cardsUrl = cardsData.publicUrl;
    const boardUrl = boardData.publicUrl;

    // Photo grid for email
    const photoGrid = people.map(p => {
      const url = photoUrls[String(p.id)] || '';
      return `<td style="padding:4px;text-align:center;width:80px">
        ${url ? `<img src="${url}" width="70" height="90" style="object-fit:cover;border-radius:6px;display:block">` : `<div style="width:70px;height:90px;background:#222;border-radius:6px;display:flex;align-items:center;justify-content:center;color:#666;font-size:11px">#${p.id+1}</div>`}
        <div style="font-size:10px;color:#ccc;margin-top:3px;overflow:hidden;white-space:nowrap;max-width:70px">${p.name}</div>
      </td>`;
    });
    const rows = [];
    for (let i = 0; i < photoGrid.length; i += 6) rows.push(`<tr>${photoGrid.slice(i,i+6).join('')}</tr>`);

    await resend.emails.send({
      from: 'Guess Who Maker <onboarding@resend.dev>',
      to: process.env.RESEND_TO_EMAIL || 'hiro@dizcharge.com',
      subject: `🎲 New order #${orderNumber} — ${clientName} (${people.length}/24 photos)`,
      html: `<!DOCTYPE html><html><body style="background:#0c0c0b;color:#eeeae0;font-family:sans-serif;margin:0;padding:0">
        <div style="max-width:600px;margin:0 auto;padding:32px 24px">
          <div style="margin-bottom:24px">
            <div style="font-size:22px;font-weight:800">Guess<span style="color:#d4f03a">Who</span>.maker</div>
          </div>
          <div style="background:#1a1a18;border:1px solid #2c2c28;border-radius:12px;padding:20px;margin-bottom:24px">
            <div style="font-size:13px;color:#7a7870;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">New order ready</div>
            <div style="font-size:28px;font-weight:800;color:#d4f03a;font-family:monospace">#${orderNumber}</div>
          </div>
          <div style="background:#161614;border:0.5px solid #2c2c28;border-radius:12px;padding:20px;margin-bottom:24px">
            <table style="width:100%;border-collapse:collapse">
              <tr><td style="padding:6px 0;font-size:13px;color:#7a7870;width:130px">Customer</td><td style="padding:6px 0;font-size:14px;font-weight:500">${clientName}</td></tr>
              <tr><td style="padding:6px 0;font-size:13px;color:#7a7870">WhatsApp</td><td style="padding:6px 0;font-size:14px">${clientPhone || '—'}</td></tr>
              <tr><td style="padding:6px 0;font-size:13px;color:#7a7870">Game title</td><td style="padding:6px 0;font-size:14px">${gameTitle || '—'}</td></tr>
              <tr><td style="padding:6px 0;font-size:13px;color:#7a7870">Photos</td><td style="padding:6px 0;font-size:14px;color:#1a9e70;font-weight:500">${people.length}/24 ✓</td></tr>
            </table>
          </div>
          <div style="background:#161614;border:0.5px solid #2c2c28;border-radius:12px;padding:20px;margin-bottom:24px">
            <div style="font-size:13px;color:#7a7870;margin-bottom:14px;text-transform:uppercase;letter-spacing:1px">Print files — open and print directly</div>
            <a href="${cardsUrl}" style="display:inline-block;background:#d4f03a;color:#0c0c0b;padding:10px 20px;border-radius:100px;font-weight:700;font-size:14px;text-decoration:none;margin-right:10px">🃏 Cards — Letter</a>
            <a href="${boardUrl}" style="display:inline-block;background:#1a9e70;color:#fff;padding:10px 20px;border-radius:100px;font-weight:700;font-size:14px;text-decoration:none">🎲 Board — Letter</a>
          </div>
          <div style="background:#161614;border:0.5px solid #2c2c28;border-radius:12px;padding:20px;margin-bottom:24px">
            <div style="font-size:13px;color:#7a7870;margin-bottom:14px;text-transform:uppercase;letter-spacing:1px">All 24 photos</div>
            <table style="border-collapse:collapse">${rows.join('')}</table>
          </div>
          <div style="text-align:center;font-size:12px;color:#7a7870;padding-top:16px;border-top:0.5px solid #2c2c28">GuessWho.maker</div>
        </div></body></html>`,
    });

    return res.status(200).json({ success: true, orderNumber, cardsUrl, boardUrl });

  } catch (err) {
    console.error('submit-order error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}

// ── CARDS PDF ─────────────────────────────────────────────────────────────────
// Paper: US Letter (216mm x 279mm), portrait
// Card size: 50mm x 75mm — 4 columns x 3 rows = 12 cards per page, 2 pages total
function generateCardsPDF(people, photoUrls, gameTitle, orderNumber) {
  const cards = people.map((p, i) => {
    const url = photoUrls[String(p.id)] || '';
    return `
      <div class="card">
        <div class="card-num">#${String(i+1).padStart(2,'0')}</div>
        <div class="card-photo">
          ${url ? `<img src="${url}" alt="${p.name}">` : `<div class="no-photo">${i+1}</div>`}
        </div>
        <div class="card-name">${p.name}</div>
        <div class="card-brand">GuessWho.maker</div>
      </div>`;
  }).join('');

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <style>
    @page { size: letter portrait; margin: 10mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; background: white; width: 216mm; }
    .header { text-align: center; margin-bottom: 6mm; padding-bottom: 3mm; border-bottom: 1px solid #eee; }
    .header h1 { font-size: 15pt; font-weight: 800; }
    .header h1 span { color: #8ab020; }
    .header p { font-size: 8pt; color: #999; margin-top: 2px; }
    .grid {
      display: grid;
      grid-template-columns: repeat(4, 50mm);
      grid-template-rows: repeat(3, 75mm);
      gap: 4mm;
      justify-content: center;
    }
    .card {
      width: 50mm; height: 75mm;
      border: 1px solid #ccc; border-radius: 4mm;
      overflow: hidden; display: flex; flex-direction: column;
      page-break-inside: avoid;
    }
    .card-num { font-size: 6pt; color: #bbb; text-align: right; padding: 1.5mm 2mm 0; font-family: monospace; }
    .card-photo { flex: 1; background: #f5f5f0; overflow: hidden; }
    .card-photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .no-photo { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 18pt; color: #ddd; }
    .card-name { font-size: 7.5pt; font-weight: 700; text-align: center; padding: 1.5mm 1mm 1mm; color: #111; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; border-top: 0.5px solid #eee; }
    .card-brand { font-size: 5.5pt; color: #ccc; text-align: center; padding-bottom: 1.5mm; letter-spacing: 0.3px; }
    .page-break { page-break-before: always; margin-top: 10mm; }
    .footer { margin-top: 5mm; font-size: 7pt; color: #aaa; text-align: center; }
  </style></head><body>
  <div class="header">
    <h1>Guess<span>Who</span>.maker — Cards</h1>
    <p>${gameTitle || 'Family Guess Who'} &nbsp;·&nbsp; Order #${orderNumber} &nbsp;·&nbsp; 50mm × 75mm per card &nbsp;·&nbsp; Print on 200g+ cardstock</p>
  </div>
  <div class="grid">${cards}</div>
  <div class="footer">✂️ Cut along card borders &nbsp;·&nbsp; 24 cards total &nbsp;·&nbsp; GuessWho.maker</div>
  <script>window.onload = () => window.print();</script>
  </body></html>`;
}

// ── BOARD PDF ─────────────────────────────────────────────────────────────────
// Paper: US Letter (216mm x 279mm), landscape (279mm x 216mm)
// Slot size: 24mm x 40mm — 6 columns x 4 rows = 24 slots
function generateBoardPDF(people, photoUrls, gameTitle, orderNumber) {
  const slots = people.map((p, i) => {
    const url = photoUrls[String(p.id)] || '';
    return `
      <div class="slot">
        <div class="slot-photo">
          ${url ? `<img src="${url}" alt="${p.name}">` : `<div class="no-photo">${i+1}</div>`}
        </div>
        <div class="slot-name">${p.name}</div>
        <div class="slot-flap"></div>
      </div>`;
  }).join('');

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <style>
    @page { size: letter landscape; margin: 8mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; background: white; width: 279mm; }
    .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4mm; padding-bottom: 3mm; border-bottom: 2px solid #111; }
    .header h1 { font-size: 14pt; font-weight: 800; }
    .header h1 span { color: #8ab020; }
    .header p { font-size: 7pt; color: #999; }
    .board {
      display: grid;
      grid-template-columns: repeat(6, 24mm);
      grid-template-rows: repeat(4, 40mm);
      gap: 3mm;
      justify-content: center;
    }
    .slot {
      width: 24mm; height: 40mm;
      border: 1.5px solid #222; border-radius: 2mm;
      overflow: hidden; display: flex; flex-direction: column;
    }
    .slot-photo { flex: 1; background: #f0ede8; overflow: hidden; }
    .slot-photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .no-photo { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 12pt; color: #ddd; }
    .slot-name { font-size: 5.5pt; font-weight: 700; text-align: center; padding: 1mm 0.5mm; background: white; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #111; border-top: 0.5px solid #ddd; }
    .slot-flap { height: 8mm; background: #0c0c0b; border-top: 1px solid #222; }
    .footer { margin-top: 4mm; display: flex; justify-content: space-between; font-size: 6.5pt; color: #aaa; }
  </style></head><body>
  <div class="header">
    <div><h1>Guess<span>Who</span>.maker — Board</h1><p>${gameTitle || 'Family Guess Who'} &nbsp;·&nbsp; Order #${orderNumber}</p></div>
    <p style="font-size:7pt;color:#999;text-align:right">6 × 4 grid &nbsp;·&nbsp; Slot: 24mm × 40mm &nbsp;·&nbsp; US Letter landscape</p>
  </div>
  <div class="board">${slots}</div>
  <div class="footer">
    <span>GuessWho.maker &nbsp;·&nbsp; Game Board Layout</span>
    <span>Black flap folds down to cover eliminated players</span>
  </div>
  <script>window.onload = () => window.print();</script>
  </body></html>`;
}

// ── FORM PARSER ───────────────────────────────────────────────────────────────
async function parseFormData(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      try {
        const body = Buffer.concat(chunks);
        const ct = req.headers['content-type'] || '';
        const boundary = ct.split('boundary=')[1];
        if (!boundary) return resolve({ fields: {}, files: {} });
        const parts = body.toString('binary').split('--' + boundary);
        const fields = {}, files = {};
        parts.slice(1, -1).forEach(part => {
          const sep = part.indexOf('\r\n\r\n');
          if (sep === -1) return;
          const header = part.slice(0, sep);
          const bodyPart = part.slice(sep + 4).replace(/\r\n$/, '');
          const nameMatch = header.match(/name="([^"]+)"/);
          const fileMatch = header.match(/filename="([^"]+)"/);
          if (!nameMatch) return;
          const name = nameMatch[1];
          if (fileMatch) files[name] = { buffer: Buffer.from(bodyPart, 'binary'), filename: fileMatch[1] };
          else fields[name] = bodyPart;
        });
        resolve({ fields, files });
      } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}
