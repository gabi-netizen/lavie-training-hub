import { createConnection } from 'mysql2/promise';

const conn = await createConnection(process.env.DATABASE_URL);

const contacts = [
  {
    name: 'Sarah Mitchell',
    email: 'sarah.mitchell@gmail.com',
    phone: '+44 7700 900123',
    leadType: 'Pre Cycle',
    status: 'new',
    agentName: 'Gabi Lavie',
    importedNotes: 'Interested in anti-ageing. Mentioned dry skin. Called in from Facebook ad.',
    source: 'Facebook',
  },
  {
    name: 'Linda Hartley',
    email: 'linda.hartley@hotmail.co.uk',
    phone: '+44 7911 123456',
    leadType: 'Live Sub',
    status: 'retained_sub',
    agentName: 'Gabi Lavie',
    importedNotes: 'Happy customer. On cycle 2. Loves Matinika.',
    source: 'Trustpilot',
  },
  {
    name: 'Karen Thompson',
    email: 'karen.t@yahoo.co.uk',
    phone: '+44 7800 654321',
    leadType: 'Cancelled Sub',
    status: 'cancelled_sub',
    agentName: 'Gabi Lavie',
    importedNotes: 'Cancelled after cycle 1. Said it was too expensive. Win-back candidate.',
    source: 'Email',
  },
  {
    name: 'Janet Williams',
    email: 'janet.w@gmail.com',
    phone: '+44 7712 987654',
    leadType: 'Cycle 1',
    status: 'working',
    agentName: 'Gabi Lavie',
    importedNotes: 'Just started trial. Needs follow-up call on day 10.',
    source: 'Instagram',
  },
  {
    name: 'Patricia Evans',
    email: 'p.evans@outlook.com',
    phone: '+44 7900 111222',
    leadType: 'Warm Lead',
    status: 'open',
    agentName: 'Gabi Lavie',
    importedNotes: 'Friend referred her. Very interested. Wants to know about the eye serum.',
    source: 'Referral',
  },
  {
    name: 'Deborah Clarke',
    email: 'debclarke@btinternet.com',
    phone: '+44 7833 445566',
    leadType: 'Cycle 2',
    status: 'assigned',
    agentName: 'Gabi Lavie',
    importedNotes: 'On second cycle. Mentioned she wants to add Oulala serum.',
    source: 'Facebook',
  },
  {
    name: 'Margaret Foster',
    email: 'margaret.foster@gmail.com',
    phone: '+44 7744 778899',
    leadType: 'Declined',
    status: 'closed',
    agentName: 'Gabi Lavie',
    importedNotes: 'Said not interested. Do not call again.',
    source: 'Cold Call',
  },
];

for (const c of contacts) {
  await conn.execute(
    `INSERT INTO contacts (name, email, phone, leadType, status, agentName, importedNotes, source, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    [c.name, c.email, c.phone, c.leadType, c.status, c.agentName, c.importedNotes, c.source]
  );
  console.log('Inserted:', c.name);
}

await conn.end();
console.log('Done — 7 test contacts inserted.');
