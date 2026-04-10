/**
 * POST /users/maid-applications  — public intake form, no auth required
 * GET  /users/maid-applications  — admin: list all applications (auth required)
 */

import type { APIGatewayProxyEvent } from 'aws-lambda';
import { withAuth, ok, getPool } from '@maidlink/shared';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

const ses = new SESClient({ region: 'us-east-1' }); // SES not available in ca-west-1

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

export const submitHandler = async (event: APIGatewayProxyEvent) => {
  try {
    const body = JSON.parse(event.body || '{}');
    const {
      fullName, email, phone, gender, age, workEligibility,
      yearsExperience = 0, bio, hourlyRatePref,
      hasOwnSupplies = false, languages = [], availability,
      canDrive = false, offersCooking = false,
      photoS3Key, idDocS3Key, referralSource,
    } = body;

    if (!fullName || !email || !phone || !gender || !age || !workEligibility || !availability) {
      return {
        statusCode: 400,
        headers: CORS,
        body: JSON.stringify({ error: 'Missing required fields: fullName, email, phone, gender, age, workEligibility, availability' }),
      };
    }

    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRe.test(email)) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid email address' }) };
    }

    const pool = getPool();
    const { rows } = await pool.query(
      `INSERT INTO maid_applications
         (full_name, email, phone, gender, age, work_eligibility,
          years_experience, bio, hourly_rate_pref, has_own_supplies,
          languages, availability, can_drive, offers_cooking,
          photo_s3_key, id_doc_s3_key, referral_source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       RETURNING id, created_at`,
      [
        fullName, email.toLowerCase().trim(), phone, gender, Number(age), workEligibility,
        Number(yearsExperience), bio || null, hourlyRatePref ? Number(hourlyRatePref) : null,
        Boolean(hasOwnSupplies), languages, availability,
        Boolean(canDrive), Boolean(offersCooking),
        photoS3Key || null, idDocS3Key || null, referralSource || null,
      ]
    );

    // Fire-and-forget notification — don't block the response
    ses.send(new SendEmailCommand({
      Source: 'noreply@maidlink.ca',
      Destination: { ToAddresses: ['muni@maidlink.ca'] },
      ...(process.env.SES_CONFIG_SET ? { ConfigurationSetName: process.env.SES_CONFIG_SET } : {}),
      Message: {
        Subject: { Data: `New Maid Application — ${fullName}` },
        Body: {
          Text: {
            Data: [
              `A new maid application was submitted.`,
              ``,
              `Name:        ${fullName}`,
              `Email:       ${email}`,
              `Phone:       ${phone}`,
              `Gender:      ${gender}`,
              `Age:         ${age}`,
              `Eligibility: ${workEligibility}`,
              `Experience:  ${yearsExperience} yr(s)`,
              `Languages:   ${Array.isArray(languages) ? languages.join(', ') : languages}`,
              `Can Drive:   ${canDrive ? 'Yes' : 'No'}`,
              `Cooking:     ${offersCooking ? 'Yes' : 'No'}`,
              `Supplies:    ${hasOwnSupplies ? 'Yes' : 'No'}`,
              `Rate Pref:   ${hourlyRatePref ? `$${hourlyRatePref}/hr` : 'Not specified'}`,
              `Referral:    ${referralSource || 'Not specified'}`,
              ``,
              `Bio: ${bio || 'N/A'}`,
              ``,
              `Submitted at: ${rows[0].created_at}`,
              `Application ID: ${rows[0].id}`,
            ].join('\n'),
          },
        },
      },
    })).catch(err => console.error('SES notification failed', err));

    return {
      statusCode: 201,
      headers: CORS,
      body: JSON.stringify({ id: rows[0].id, submittedAt: rows[0].created_at }),
    };
  } catch (err) {
    console.error('maidApplication.submitHandler error', err);
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Internal server error' }) };
  }
};

export const listHandler = withAuth(async (_event: APIGatewayProxyEvent) => {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT * FROM maid_applications ORDER BY created_at DESC`
  );
  return ok(rows);
}, ['ADMIN']);
