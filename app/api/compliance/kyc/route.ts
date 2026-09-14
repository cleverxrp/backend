import type { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/firebase/auth';
import { submitKyc, getKycStatus } from '@/lib/services/compliance-service';
import { ok, fail } from '@/lib/utils/response';
import { parseBody, kycSubmitSchema } from '@/lib/utils/validation';
import { rateLimitRequest } from '@/lib/security/rate-limit';

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireAuth(req);
    const status = await getKycStatus(ctx.user!.id);
    return ok({ kycStatus: status });
  } catch (err) {
    return fail(err, { route: 'GET /api/compliance/kyc' });
  }
}

export async function POST(req: NextRequest) {
  try {
    rateLimitRequest(req, 'compliance.kyc.submit', 5, 60_000);
    const ctx = await requireAuth(req);
    const body = parseBody(kycSubmitSchema, await req.json());

    const status = await submitKyc(ctx.user!.id, {
      fullName: body.fullName,
      idType: body.idType,
      idNumber: body.idNumber,
      documentUrl: body.documentUrl,
      selfieUrl: body.selfieUrl,
    });

    return ok({ kycStatus: status }, 201);
  } catch (err) {
    return fail(err, { route: 'POST /api/compliance/kyc' });
  }
}
