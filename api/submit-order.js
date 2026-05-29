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

    // Upload photos to Supabase
    const photoUrls = {};
    await Promise.all(Object.entries(files).map(async ([key, file]) => {
      const slotId = key.replace('photo_', '');
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

    // Print URLs — served by /api/generate-print (renders HTML with photos)
    const appUrl = process.env.APP_URL || 'https://dizingcreative-guesswho.vercel.app';
    const cardsUrl = `${appUrl}/api/generate-print?order=${orderNumber}&type=cards`;
    const boardUrl = `${appUrl}/api/generate-print?order=${orderNumber}&type=board`;

    // Email photo grid
    const photoGrid = people.map(p => {
      const url = photoUrls[String(p.id)] || '';
      return `<td style="padding:4px;text-align:center;width:80px">
        ${url ? `<img src="${url}" width="70" height="90" style="object-fit:cover;border-radius:6px;display:block">` : `<div style="width:70px;height:90px;background:#222;border-radius:6px;color:#666;font-size:11px;display:flex;align-items:center;justify-content:center">#${p.id+1}</div>`}
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
          <div style="margin-bottom:24px"><div style="font-size:22px;font-weight:800">Guess<span style="color:#d4f03a">Who</span>.maker</div></div>
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
            <div style="font-size:13px;color:#7a7870;margin-bottom:14px;text-transform:uppercase;letter-spacing:1px">🖨️ Print files</div>
            <a href="${cardsUrl}" style="display:inline-block;background:#d4f03a;color:#0c0c0b;padding:12px 24px;border-radius:100px;font-weight:700;font-size:14px;text-decoration:none;margin-right:10px;margin-bottom:8px">🃏 Cards — Letter</a>
            <a href="${boardUrl}" style="display:inline-block;background:#1a9e70;color:#fff;padding:12px 24px;border-radius:100px;font-weight:700;font-size:14px;text-decoration:none;margin-bottom:8px">🎲 Game Board — Letter</a>
            <p style="font-size:12px;color:#7a7870;margin-top:8px">Opens in browser → prints automatically with all photos</p>
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
