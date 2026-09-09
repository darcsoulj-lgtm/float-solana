import { db } from './server';
export async function seedDemos() {
  const now = Date.now();
  const rows = [
    [
      'demo-mu',
      'MU',
      'Memory cycle: what changes the thesis?',
      'An illustrative research design exploring the catalysts and risks that memory-sector investors follow. All example responses are simulated.',
    ],
    [
      'demo-skhy',
      'SKHY',
      'AI infrastructure: the next constraint',
      'An illustrative study about AI infrastructure expectations. This sample is synthetic and cannot be used as investment evidence.',
    ],
    [
      'demo-spcx',
      'SPCX',
      'Space infrastructure: a long-term view',
      'An illustrative research design only. SPCX live verification remains disabled until its official mint is independently validated.',
    ],
  ];
  for (const [id, symbol, title, description] of rows) {
    const questions = [
      {
        id: 'q1',
        prompt: 'Which factor would most change your thesis?',
        type: 'single',
        options: ['Earnings outlook', 'Competitive position', 'Valuation'],
      },
      {
        id: 'q2',
        prompt: 'What is your intended holding horizon?',
        type: 'single',
        options: ['Under 6 months', '6–24 months', 'More than 2 years'],
      },
    ];
    await db()
      .prepare(
        'INSERT OR IGNORE INTO surveys (id,owner_id,title,description,symbol,questions,status,demo,target,reward_cents,salt,created_at,updated_at) VALUES (?,?,?,?,?,?,?,1,100,0,?,?,?)',
      )
      .bind(
        id,
        'system-demo',
        title,
        description,
        symbol,
        JSON.stringify(questions),
        'active',
        crypto.randomUUID(),
        now,
        now,
      )
      .run();
    const statements = Array.from({ length: 24 }, (_, i) =>
      db()
        .prepare(
          'INSERT OR IGNORE INTO responses (id,survey_id,wallet_hash,answers,cohort,slot,verified_at,created_at,demo) VALUES (?,?,?,?,?,0,0,?,1)',
        )
        .bind(
          `${id}-${i}`,
          id,
          `synthetic-${i}`,
          JSON.stringify({
            q1: questions[0].options[i % 3],
            q2: questions[1].options[i < 14 ? 2 : i < 20 ? 1 : 0],
          }),
          ['Under 10 tokens', '10–99 tokens', '100+ tokens'][i % 3],
          now - (24 - i) * 3600000,
        ),
    );
    await db().batch(statements);
  }
  return { seeded: 3, simulatedResponses: 72 };
}
