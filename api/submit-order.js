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

    // Build base64 map AND upload to Supabase simultaneously
    const photoBase64 = {};
    const photoUrls = {};

    await Promise.all(Object.entries(files).map(async ([key, file]) => {
      const slotId = key.replace('photo_', '');
      // Store base64 for PDF generation
      photoBase64[slotId] = `data:image/jpeg;base64,${file.buffer.toString('base64')}`;
      // Upload to Supabase for storage
      const path = `orders/${orderNumber}/slot_${slotId}.jpg`;
      const { error } = await supabase.storage.from('Photos').upload(path, file.buffer, { contentType: 'image/jpeg', upsert: true });
      if (!error) {
        const { data } = supabase.storage.from('Photos').getPublicUrl(path);
        photoUrls[slotId] = data.publicUrl;
      }
    }));

    // Save to DB
    await supabase.from('orders').insert({
      order_number: orderNumber, client_name: clientName, client_phone: clientPhone,
      game_title: gameTitle, status: 'complete', photos_count: Object.keys(photoUrls).length,
      created_at: new Date().toISOString(),
    });
    await supabase.from('people').insert(
      people.map(p => ({ order_number: orderNumber, slot: p.id, name: p.name, photo_url: photoUrls[String(p.id)] || null }))
    );

    // Generate HTML files with base64 images embedded (no internet needed to print)
    const cardsHtml = generateCardsPDF(people, photoBase64, gameTitle, orderNumber);
    const boardHtml = generateBoardPDF(people, photoBase64, gameTitle, orderNumber);

    const cardsPath = `orders/${orderNumber}/cards.html`;
    const boardPath = `orders/${orderNumber}/board.html`;

    await supabase.storage.from('PDFS').upload(cardsPath, Buffer.from(cardsHtml, 'utf8'), { contentType: 'text/html;charset=utf-8', upsert: true });
    await supabase.storage.from('PDFS').upload(boardPath, Buffer.from(boardHtml, 'utf8'), { contentType: 'text/html;charset=utf-8', upsert: true });

    const { data: cardsData } = supabase.storage.from('PDFS').getPublicUrl(cardsPath);
    const { data: boardData } = supabase.storage.from('PDFS').getPublicUrl(boardPath);
    const cardsUrl = cardsData.publicUrl;
    const boardUrl = boardData.publicUrl;

    // Email photo grid using Supabase public URLs
    const photoGrid = people.map(p => {
      const url = photoUrls[String(p.id)] || '';
      return `<td style="padding:4px;text-align:center;width:80px">
        ${url
          ? `<img src="${url}" width="70" height="90" style="object-fit:cover;border-radius:6px;display:block">`
          : `<div style="width:70px;height:90px;background:#222;border-radius:6px;display:flex;align-items:center;justify-content:center;color:#666;font-size:11px">#${p.id+1}</div>`
        }
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
            <div style="font-size:13px;color:#7a7870;margin-bottom:14px;text-transform:uppercase;letter-spacing:1px">🖨️ Print files — click to open & print</div>
            <a href="${cardsUrl}" style="display:inline-block;background:#d4f03a;color:#0c0c0b;padding:12px 24px;border-radius:100px;font-weight:700;font-size:14px;text-decoration:none;margin-right:10px;margin-bottom:8px">🃏 Cards — Letter</a>
            <a href="${boardUrl}" style="display:inline-block;background:#1a9e70;color:#fff;padding:12px 24px;border-radius:100px;font-weight:700;font-size:14px;text-decoration:none;margin-bottom:8px">🎲 Game Board — Letter</a>
            <p style="font-size:12px;color:#7a7870;margin-top:8px">Opens in browser → browser will prompt to print automatically</p>
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

// ── CARDS HTML (base64 images embedded, Letter portrait) ─────────────────────
function generateCardsPDF(people, photoBase64, gameTitle, orderNumber) {
  const cards = people.map((p, i) => {
    const src = photoBase64[String(p.id)] || '';
    return `
      <div class="card">
        <div class="card-num">#${String(i+1).padStart(2,'0')}</div>
        <div class="card-photo">
          ${src
            ? `<img src="${src}" alt="${p.name}">`
            : `<div class="no-photo">${i+1}</div>`
          }
        </div>
        <div class="card-name">${p.name}</div>
        <div class="card-brand">GuessWho.maker</div>
      </div>`;
  }).join('');

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
    <p>${gameTitle || 'Family Guess Who'} · Order #${orderNumber} · 50mm × 75mm · Print on 200g+ cardstock · Cut along borders</p>
  </div>
  <div class="grid">${cards}</div>
  <div class="footer">✂️ Cut along card borders · 24 cards total · GuessWho.maker</div>
  <script>window.onload = () => setTimeout(() => window.print(), 800);<\/script>
  </body></html>`;
}

// ── BOARD HTML (base64 images embedded, Letter landscape) ────────────────────
function generateBoardPDF(people, photoBase64, gameTitle, orderNumber) {
  const slots = people.map((p, i) => {
    const src = photoBase64[String(p.id)] || '';
    return `
      <div class="slot">
        <div class="slot-photo">
          ${src
            ? `<img src="${src}" alt="${p.name}">`
            : `<div class="no-photo">${i+1}</div>`
          }
        </div>
        <div class="slot-name">${p.name}</div>
        <div class="slot-flap"></div>
      </div>`;
  }).join('');

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <style>
    @page { size: letter landscape; margin: 8mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; background: white; }
    .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4mm; padding-bottom: 3mm; border-bottom: 2px solid #111; }
    .header h1 { font-size: 14pt; font-weight: 800; }
    .header h1 span { color: #8ab020; }
    .header p { font-size: 7pt; color: #999; }
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
    <p style="font-size:7pt;color:#999;text-align:right">6 × 4 grid · Slot: 24mm × 40mm · US Letter landscape</p>
  </div>
  <div class="board">${slots}</div>
  <div class="footer">
    <span>GuessWho.maker · Game Board Layout</span>
    <span>Black flap folds down to cover eliminated players</span>
  </div>
  <script>window.onload = () => setTimeout(() => window.print(), 800);<\/script>
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
