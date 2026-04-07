import { Client, Pool } from 'pg';

const DB_CONFIG = {
  host:     'localhost',
  port:     5432,
  database: 'maidlink',
  user:     'maidlink_dev',
  password: 'devpassword',
  ssl:      false as const,
};

export function createTestPool(): Pool {
  return new Pool({ ...DB_CONFIG, max: 5 });
}

/**
 * Returns a fresh, connected pg Client — single connection, no pooling.
 * All seed helpers use this so every INSERT is guaranteed visible to
 * subsequent INSERTs on the same connection (no multi-connection race).
 * Caller must call client.end() when done.
 */
export async function createTestClient(): Promise<Client> {
  const client = new Client(DB_CONFIG);
  await client.connect();
  return client;
}

/** Truncate all app tables in FK-safe order. */
export async function cleanTables(db: Pool | Client): Promise<void> {
  await db.query(`
    TRUNCATE
      reviews,
      maid_applications,
      estimator_analyses,
      bookings,
      availability_overrides,
      availability_recurring,
      maid_profiles,
      user_roles,
      refresh_tokens,
      users
    RESTART IDENTITY CASCADE
  `);
}

type UserRow = { id: string; email: string; fullName: string };

export async function seedUser(
  db: Pool | Client,
  overrides: { email?: string; fullName?: string; googleSub?: string } = {},
): Promise<UserRow> {
  const ts        = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const email     = overrides.email     ?? `user_${ts}@test.local`;
  const fullName  = overrides.fullName  ?? 'Test User';
  const googleSub = overrides.googleSub ?? `google_${ts}`;

  const { rows: [u] } = await db.query<{ id: string }>(
    `INSERT INTO users (google_sub, email, full_name) VALUES ($1, $2, $3) RETURNING id`,
    [googleSub, email, fullName],
  );
  return { id: u.id, email, fullName };
}

export async function seedMaid(
  db: Pool | Client,
  userId: string,
  { hourlyRate = 30, status = 'APPROVED' }: { hourlyRate?: number; status?: string } = {},
): Promise<{ id: string }> {
  const { rows: [m] } = await db.query<{ id: string }>(
    `INSERT INTO maid_profiles (user_id, hourly_rate, status, years_experience)
     VALUES ($1, $2, $3, 0) RETURNING id`,
    [userId, hourlyRate, status],
  );
  await db.query(
    `INSERT INTO user_roles (user_id, role) VALUES ($1, 'MAID')`,
    [userId],
  );
  return { id: m.id };
}

export async function seedAvailability(
  db: Pool | Client,
  maidId: string,
  {
    dayOfWeek = 'MON',
    startTime = '08:00',
    endTime   = '20:00',
  }: { dayOfWeek?: string; startTime?: string; endTime?: string } = {},
): Promise<void> {
  await db.query(
    `INSERT INTO availability_recurring (maid_id, day_of_week, start_time, end_time)
     VALUES ($1, $2, $3, $4)`,
    [maidId, dayOfWeek, startTime, endTime],
  );
}
