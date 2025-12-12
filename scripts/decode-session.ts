import { decode } from 'next-auth/jwt';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const token = "eyJhbGciOiJkaXIiLCJlbmMiOiJBMjU2Q0JDLUhTNTEyIiwia2lkIjoiVndRZVpDOUdwbEZVSHY1QU90S1FRMjAxcGgzM3ZBS1k0aXlNSkxSSUdnZWZyd3h6aWxFY1F5ZXF3ZVZGUWVRcnVTcFVRSmE5NzVmNHZaUkptQkh4ZEEifQ..0UasTOHtJLVMknEMdXRMMg.kHt0pfpGRhgdYkUAcPSTFf2Dn9w-OdH7_SeCD5vmXS7IDFeLmr5rMZNxb5jIBa9bo7nWbwOFIDyQtYRjW25V4Fs7ao61A4edHrAmFkG75FLNBbnVJfQ2GLXpefUVeDS7SAgYHGzaIrM_Ad_wOMkSdI-HNEyK8oFNPRqT6W97dnzoyYDK-L9fTtkWdnrQ-QGIv020BVEuslWDeWc4ivg0VfGrq3HUVVeHljUIZZqOdAQ.X34rbRxbX909GHD6KjQJhIWgxfq_a0ThJ6RyiRBo5Ms";

async function main() {
  console.log('Decoding session token...\n');

  try {
    const secret = process.env.AUTH_SECRET;

    if (!secret) {
      console.error('AUTH_SECRET not found in environment variables');
      return;
    }

    const decoded = await decode({
      token,
      secret,
    });

    console.log('Decoded session:');
    console.log(JSON.stringify(decoded, null, 2));
  } catch (error) {
    console.error('Error decoding token:', error);
  }
}

main();
