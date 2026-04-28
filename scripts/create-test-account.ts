import crypto from 'crypto';
import { db } from '../server/db';
import { spiralCustomers } from '../shared/schema';
import { eq } from 'drizzle-orm';

async function main() {
  const email = 'test@spiral.app';
  const password = 'spiral1234';
  const firstName = 'Spiral';
  const lastName = 'Tester';

  const salt = crypto.randomBytes(16).toString('hex');
  const passwordHash = crypto.createHash('sha256').update(salt + password).digest('hex') + ':' + salt;
  const unsubscribeToken = crypto.randomBytes(32).toString('hex');

  const existing = await db.select().from(spiralCustomers).where(eq(spiralCustomers.email, email));

  if (existing.length > 0) {
    await db.update(spiralCustomers).set({
      passwordHash,
      emailVerified: true,
      firstName,
      lastName,
      country: 'GB',
      isActive: true,
    }).where(eq(spiralCustomers.email, email));
    console.log('UPDATED existing test account:');
  } else {
    await db.insert(spiralCustomers).values({
      email,
      firstName,
      lastName,
      passwordHash,
      emailVerified: true,
      country: 'GB',
      isActive: true,
      unsubscribeToken,
    });
    console.log('CREATED new test account:');
  }

  console.log('  email:    ', email);
  console.log('  password: ', password);
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
