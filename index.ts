import { router, json, error, requireAuth, db, notifications } from '@appdeploy/sdk';
import { notifySubscribers, realtimeSubscriptionRoutes } from './realtime-subscribers';
import { computeRisk, requiredCommodities, ACK_SLA_MIN, Vitals } from './risk';

type Role = 'chw' | 'facility' | 'district';

interface Profile {
    authUserId: string;
    role: Role;
    facilityId?: string;
    name?: string;
    createdAt: number;
}

interface Mother {
    phone: string;
    name?: string;
    region?: string;
    facilityId?: string;
    nextAppointmentDate?: string;
    linkedPatientId?: string;
    createdAt: number;
}

const SEED_FACILITIES = [
    { name: 'Riverside Health Centre', level: 'Health Centre', region: 'Meru County', lat: 0.02, lng: 37.64, phone: '+254 712 001 001', stock: { oxytocin: 22, magnesium: 3, misoprostol: 40, blood: 1, antibiotics: 25 } },
    { name: 'St. Aloys Mission Hospital', level: 'Hospital', region: 'Meru County', lat: 0.08, lng: 37.7, phone: '+254 712 001 002', stock: { oxytocin: 60, magnesium: 20, misoprostol: 90, blood: 9, antibiotics: 70 } },
    { name: 'Kabaru Dispensary', level: 'Dispensary', region: 'Meru County', lat: 0.01, lng: 37.63, phone: '+254 712 001 003', stock: { oxytocin: 3, magnesium: 2, misoprostol: 8, blood: 0, antibiotics: 6 } },
    { name: 'Northgate District Hospital', level: 'Hospital', region: 'Meru County', lat: 0.15, lng: 37.75, phone: '+254 712 001 004', stock: { oxytocin: 45, magnesium: 15, misoprostol: 70, blood: 12, antibiotics: 55 } },
    { name: 'Lakeview Health Centre', level: 'Health Centre', region: 'Kisumu County', lat: -0.085, lng: 34.76, phone: '+254 712 001 005', stock: { oxytocin: 30, magnesium: 10, misoprostol: 50, blood: 4, antibiotics: 40 } },
    { name: 'Sunrise Maternity Wing', level: 'Hospital', region: 'Kisumu County', lat: -0.11, lng: 34.79, phone: '+254 712 001 006', stock: { oxytocin: 40, magnesium: 6, misoprostol: 60, blood: 1, antibiotics: 35 } },
];

async function ensureFacilitiesSeeded() {
    const { items } = await db.list('facilities', { limit: 50 });
    if (items.length > 0) return items;
    await db.add('facilities', SEED_FACILITIES);
    const { items: seeded } = await db.list('facilities', { limit: 50 });
    return seeded;
}

async function findProfile(authUserId: string): Promise<(Profile & { id: string }) | null> {
    const { items } = await db.list<Profile>('profiles', { filter: { authUserId }, limit: 200 });
    return (items[0] as any) || null;
}

async function notifyRoleUsers(role: Role, facilityId: string | undefined, title: string, body: string, data: Record<string, string>) {
    const { items: profiles } = await db.list<Profile>('profiles', { limit: 500 });
    const targets = profiles.filter((p) => p.role === role && (role !== 'facility' || p.facilityId === facilityId)).map((p) => p.authUserId);
    if (targets.length === 0) return;
    await notifications.send({ userIds: targets, notification: { title, body }, data });
}

async function findMother(phone: string): Promise<(Mother & { id: string }) | null> {
    if (!phone) return null;
    const { items } = await db.list<Mother>('mothers', { filter: { phone }, limit: 50 });
    return (items[0] as any) || null;
}

async function upsertMother(phone: string, patch: Partial<Mother>): Promise<Mother & { id: string }> {
    const existing = await findMother(phone);
    const record: Mother = {
        phone,
        name: patch.name ?? existing?.name,
        region: patch.region ?? existing?.region,
        facilityId: patch.facilityId ?? existing?.facilityId,
        nextAppointmentDate: patch.nextAppointmentDate ?? existing?.nextAppointmentDate,
        linkedPatientId: patch.linkedPatientId ?? existing?.linkedPatientId,
        createdAt: existing?.createdAt || Date.now(),
    };
    if (existing) {
        await db.update('mothers', [{ id: existing.id, record }]);
        return { id: existing.id, ...record };
    }
    const [id] = await db.add('mothers', [record]);
    return { id: id || '', ...record };
}

async function createMotherReport(mother: { id: string; facilityId?: string; name?: string }, vitals: Vitals, name: string) {
    const patientRecord = {
        name,
        age: 0,
        gestWeeks: 0,
        facilityId: mother.facilityId,
        vitals,
        createdByUserId: 'ussd',
        createdAt: Date.now(),
    };
    const [patientId] = await db.add('patients', [patientRecord]);
    const risk = computeRisk(vitals);
    await db.add('events', [{ patientId, ts: Date.now(), detail: `Mother self-reported via USSD — ${risk.label}` }]);
    const needed = requiredCommodities(vitals);
    const [facility] = mother.facilityId ? await db.get<any>('facilities', [mother.facilityId]) : [null];
    const t = Date.now();
    const referralRecord = {
        patientId,
        facilityId: mother.facilityId,
        homeRegion: (facility as any)?.region,
        urgency: risk.level,
        status: 'pending',
        needed,
        createdAt: t,
        assignedAt: t,
        arrivedAt: null,
        rerouteCount: 0,
        escalatedNotified: false,
        source: 'mother_ussd',
    };
    const [referralId] = await db.add('referrals', [referralRecord]);
    await db.add('events', [{ patientId, ts: Date.now(), detail: `Self-report routed to ${(facility as any)?.name || 'nearest facility'}` }]);
    if (mother.facilityId) {
        await notifyRoleUsers('facility', mother.facilityId, 'Mother self-reported via USSD', `${risk.label} — needs follow-up`, { referralId: referralId || '', patientId: patientId || '' });
    }
    await notifySubscribers('patients', 'global', { resource: 'patients' });
    await notifySubscribers('events', 'global', { resource: 'events' });
    await notifySubscribers('referrals', 'global', { resource: 'referrals' });
    return { risk, facility };
}

const REGION_CHOICES: Record<string, string> = { '1': 'Meru County', '2': 'Kisumu County' };

async function firstFacilityInRegion(region: string) {
    const { items } = await db.list<any>('facilities', { filter: { region }, limit: 50 });
    return items[0] || null;
}

function emergencyVitals(): Vitals {
    return { systolic: 0, diastolic: 0, bleeding: true, convulsions: false, severeHeadache: false, fever: false, reducedFetalMovement: false, prolongedLabor: false, otherSymptom: 'Emergency request via USSD' };
}

const SYMPTOM_KEYS: Record<string, keyof Vitals> = { '1': 'bleeding', '2': 'convulsions', '3': 'severeHeadache', '4': 'fever', '5': 'reducedFetalMovement' };

function symptomVitals(code: string): Vitals {
    const v: Vitals = { systolic: 0, diastolic: 0, bleeding: false, convulsions: false, severeHeadache: false, fever: false, reducedFetalMovement: false, prolongedLabor: false, otherSymptom: '' };
    const key = SYMPTOM_KEYS[code];
    if (key) (v as any)[key] = true;
    return v;
}

async function buildUssdResponse(phoneNumber: string, text: string): Promise<string> {
    await ensureFacilitiesSeeded();
    const parts = text ? text.split('*').filter(Boolean) : [];
    const mother = await findMother(phoneNumber);

    if (parts.length === 0) {
        return 'CON Welcome to MamaConnect\n1. I need help now\n2. Report a symptom\n3. My next reminder\n4. My health worker\'s contact';
    }

    const choice = parts[0];

    if (choice === '1') {
        if (mother?.facilityId) {
            const report = await createMotherReport(mother, emergencyVitals(), mother.name || 'Mother (USSD)');
            return `END Help is on the way. Your health worker has been notified. If you can, go to ${(report.facility as any)?.name || 'your nearest facility'} now.`;
        }
        if (parts.length === 1) {
            return 'CON Which area are you in?\n1. Meru County\n2. Kisumu County';
        }
        if (parts.length === 2) {
            const region = REGION_CHOICES[parts[1]];
            if (!region) return 'END Sorry, invalid choice. Please dial in again.';
            const facility = await firstFacilityInRegion(region);
            const updated = await upsertMother(phoneNumber, { region, facilityId: facility?.id });
            const report = await createMotherReport(updated, emergencyVitals(), 'Mother (USSD)');
            return `END Help is on the way. Your health worker has been notified. If you can, go to ${(report.facility as any)?.name || facility?.name || 'your nearest facility'} now.`;
        }
        return 'END Sorry, invalid choice. Please dial in again.';
    }

    if (choice === '2') {
        if (parts.length === 1) {
            return 'CON Which is closest to what you feel?\n1. Heavy bleeding\n2. Fits or convulsions\n3. Severe headache or blurred vision\n4. High fever\n5. Baby moving less than usual';
        }
        const symptomCode = parts[1];
        if (!SYMPTOM_KEYS[symptomCode]) return 'END Sorry, invalid choice. Please dial in again.';
        const vitals = symptomVitals(symptomCode);

        if (mother?.facilityId) {
            const report = await createMotherReport(mother, vitals, mother.name || 'Mother (USSD)');
            return `END Thank you. Your health worker has been notified. If this gets worse, go to ${(report.facility as any)?.name || 'your nearest facility'} now.`;
        }
        if (parts.length === 2) {
            return 'CON Which area are you in?\n1. Meru County\n2. Kisumu County';
        }
        if (parts.length === 3) {
            const region = REGION_CHOICES[parts[2]];
            if (!region) return 'END Sorry, invalid choice. Please dial in again.';
            const facility = await firstFacilityInRegion(region);
            const updated = await upsertMother(phoneNumber, { region, facilityId: facility?.id });
            const report = await createMotherReport(updated, vitals, 'Mother (USSD)');
            return `END Thank you. Your health worker has been notified. If this gets worse, go to ${(report.facility as any)?.name || facility?.name || 'your nearest facility'} now.`;
        }
        return 'END Sorry, invalid choice. Please dial in again.';
    }

    if (choice === '3') {
        if (!mother?.nextAppointmentDate) {
            return 'END You have no upcoming reminder on file. Please contact your local health worker.';
        }
        return `END Your next appointment is on ${mother.nextAppointmentDate}.`;
    }

    if (choice === '4') {
        if (!mother?.facilityId) {
            return 'END You are not yet linked to a facility. Please visit your local health worker to register.';
        }
        const [facility] = await db.get<any>('facilities', [mother.facilityId]);
        return `END Your facility: ${(facility as any)?.name || 'Unknown'}, ${(facility as any)?.phone || ''}. For emergencies, dial in and select 1.`;
    }

    return 'END Sorry, invalid choice. Please dial in again.';
}

export const handler = router({
    'GET /api/_healthcheck': [async () => json({ message: 'Success' })],

    'POST /api/ussd': [
        async (ctx) => {
            const rawBody = (ctx.event && ctx.event.body) || '';
            const decoded = ctx.event && ctx.event.isBase64Encoded ? Buffer.from(rawBody, 'base64').toString('utf-8') : rawBody;
            const params = new URLSearchParams(decoded);
            const phoneNumber = (params.get('phoneNumber') || '').trim();
            const text = (params.get('text') || '').trim();
            const responseText = await buildUssdResponse(phoneNumber, text);
            return { statusCode: 200, headers: { 'Content-Type': 'text/plain' }, body: responseText };
        },
    ],

    'GET /api/profile': [
        requireAuth(),
        async (ctx) => {
            const profile = await findProfile(ctx.user!.userId);
            return json({ profile });
        },
    ],

    'POST /api/profile': [
        requireAuth(),
        async (ctx) => {
            const body = (ctx.body || {}) as { role?: Role; facilityId?: string; name?: string };
            if (!body.role || !['chw', 'facility', 'district'].includes(body.role)) {
                return error('A valid role is required');
            }
            if ((body.role === 'chw' || body.role === 'facility') && !body.facilityId) {
                return error('facilityId is required for this role');
            }
            const existing = await findProfile(ctx.user!.userId);
            const record: Profile = {
                authUserId: ctx.user!.userId,
                role: body.role,
                facilityId: body.role === 'district' ? undefined : body.facilityId,
                name: body.name || ctx.user!.name || ctx.user!.email || 'Unnamed',
                createdAt: existing?.createdAt || Date.now(),
            };
            if (existing) {
                await db.update('profiles', [{ id: existing.id, record }]);
            } else {
                await db.add('profiles', [record]);
            }
            return json({ profile: record });
        },
    ],

    'GET /api/facilities': [
        requireAuth(),
        async () => {
            const items = await ensureFacilitiesSeeded();
            return json({ facilities: items });
        },
    ],

    'PUT /api/facilities/:id/stock': [
        requireAuth(),
        async (ctx) => {
            const profile = await findProfile(ctx.user!.userId);
            if (!profile || (profile.role !== 'facility' && profile.role !== 'district')) {
                return error('Not authorized to edit stock', 403);
            }
            if (profile.role === 'facility' && profile.facilityId !== ctx.params.id) {
                return error('Not authorized for this facility', 403);
            }
            const { key, delta } = (ctx.body || {}) as { key: string; delta: number };
            if (!key || typeof delta !== 'number') return error('key and delta are required');
            const [facility] = await db.get<any>('facilities', [ctx.params.id]);
            if (!facility) return error('Facility not found', 404);
            const stock = { ...(facility.stock || {}) };
            stock[key] = Math.max(0, (stock[key] || 0) + delta);
            await db.update('facilities', [{ id: ctx.params.id, record: { ...facility, stock } }]);
            await notifySubscribers('facilities', 'global', { resource: 'facilities' });
            return json({ ok: true });
        },
    ],

    'GET /api/patients': [
        requireAuth(),
        async () => {
            const { items } = await db.list('patients', { limit: 500 });
            return json({ patients: items });
        },
    ],

    'POST /api/patients': [
        requireAuth(),
        async (ctx) => {
            const profile = await findProfile(ctx.user!.userId);
            if (!profile || profile.role !== 'chw') return error('Only CHWs can record assessments', 403);
            const body = (ctx.body || {}) as Record<string, any>;
            if (!body.name || !body.age || !body.gestWeeks || !body.facilityId) {
                return error('name, age, gestWeeks, and facilityId are required');
            }
            const age = Number(body.age);
            const gestWeeks = Number(body.gestWeeks);
            if (!Number.isFinite(age) || age < 10 || age > 60) return error('age must be between 10 and 60');
            if (!Number.isFinite(gestWeeks) || gestWeeks < 1 || gestWeeks > 45) return error('gestational weeks must be between 1 and 45');

            const vitals: Vitals = {
                systolic: Number(body.systolic) || 0,
                diastolic: Number(body.diastolic) || 0,
                bleeding: !!body.bleeding,
                convulsions: !!body.convulsions,
                severeHeadache: !!body.severeHeadache,
                fever: !!body.fever,
                reducedFetalMovement: !!body.reducedFetalMovement,
                prolongedLabor: !!body.prolongedLabor,
                otherSymptom: body.otherSymptom || '',
            };
            const patientRecord = {
                name: String(body.name),
                age,
                gestWeeks,
                facilityId: String(body.facilityId),
                vitals,
                createdByUserId: ctx.user!.userId,
                createdAt: Date.now(),
            };
            const [patientId] = await db.add('patients', [patientRecord]);
            if (!patientId) return error('Failed to save patient', 500);

            if (body.motherPhone) {
                await upsertMother(String(body.motherPhone), {
                    name: patientRecord.name,
                    facilityId: patientRecord.facilityId,
                    nextAppointmentDate: body.nextAppointmentDate || undefined,
                    linkedPatientId: patientId,
                });
            }

            const risk = computeRisk(vitals);
            await db.add('events', [{ patientId, ts: Date.now(), detail: `Field assessment recorded — ${risk.label}` }]);

            let referral: any = null;
            if (risk.level === 'emergency' || risk.level === 'high') {
                const needed = requiredCommodities(vitals);
                const [facility] = await db.get<any>('facilities', [patientRecord.facilityId]);
                const t = Date.now();
                const referralRecord = {
                    patientId, facilityId: patientRecord.facilityId, homeRegion: facility?.region, urgency: risk.level,
                    status: 'pending', needed, createdAt: t, assignedAt: t, arrivedAt: null, rerouteCount: 0, escalatedNotified: false, source: 'chw',
                };
                const [referralId] = await db.add('referrals', [referralRecord]);
                referral = { id: referralId, ...referralRecord };
                await db.add('events', [{ patientId, ts: Date.now(), detail: `Referral triggered to ${facility?.name || 'nearest facility'} — ${risk.label}` }]);
                await notifyRoleUsers('facility', patientRecord.facilityId, 'Incoming referral', `${patientRecord.name} — ${risk.label}`, { referralId: referralId || '', patientId: patientId || '' });
            }

            await notifySubscribers('patients', 'global', { resource: 'patients' });
            await notifySubscribers('events', 'global', { resource: 'events' });
            if (referral) await notifySubscribers('referrals', 'global', { resource: 'referrals' });
            return json({ patientId, risk, referral });
        },
    ],

    'GET /api/referrals': [
        requireAuth(),
        async () => {
            const { items } = await db.list('referrals', { limit: 500 });
            return json({ referrals: items });
        },
    ],

    'POST /api/referrals/:id/acknowledge': [
        requireAuth(),
        async (ctx) => {
            const profile = await findProfile(ctx.user!.userId);
            const [ref] = await db.get<any>('referrals', [ctx.params.id]);
            if (!ref) return error('Referral not found', 404);
            if (!profile || profile.role === 'chw' || (profile.role === 'facility' && profile.facilityId !== ref.facilityId)) {
                return error('Not authorized', 403);
            }
            await db.update('referrals', [{ id: ctx.params.id, record: { ...ref, status: 'acknowledged' } }]);
            const [facility] = await db.get<any>('facilities', [ref.facilityId]);
            await db.add('events', [{ patientId: ref.patientId, ts: Date.now(), detail: `${facility?.name || 'Facility'} acknowledged the referral, preparing` }]);
            await notifySubscribers('referrals', 'global', { resource: 'referrals' });
            await notifySubscribers('events', 'global', { resource: 'events' });
            return json({ ok: true });
        },
    ],

    'POST /api/referrals/:id/arrived': [
        requireAuth(),
        async (ctx) => {
            const profile = await findProfile(ctx.user!.userId);
            const [ref] = await db.get<any>('referrals', [ctx.params.id]);
            if (!ref) return error('Referral not found', 404);
            if (!profile || profile.role === 'chw' || (profile.role === 'facility' && profile.facilityId !== ref.facilityId)) {
                return error('Not authorized', 403);
            }
            await db.update('referrals', [{ id: ctx.params.id, record: { ...ref, status: 'arrived', arrivedAt: Date.now() } }]);
            const [facility] = await db.get<any>('facilities', [ref.facilityId]);
            await db.add('events', [{ patientId: ref.patientId, ts: Date.now(), detail: `Arrived at ${facility?.name || 'facility'}` }]);
            await notifySubscribers('referrals', 'global', { resource: 'referrals' });
            await notifySubscribers('events', 'global', { resource: 'events' });
            return json({ ok: true });
        },
    ],

    'POST /api/referrals/:id/reroute': [
        requireAuth(),
        async (ctx) => {
            const { newFacilityId } = (ctx.body || {}) as { newFacilityId: string };
            if (!newFacilityId) return error('newFacilityId is required');
            const [ref] = await db.get<any>('referrals', [ctx.params.id]);
            if (!ref) return error('Referral not found', 404);
            const [oldFacility] = await db.get<any>('facilities', [ref.facilityId]);
            const [newFacility] = await db.get<any>('facilities', [newFacilityId]);
            await db.update('referrals', [{ id: ctx.params.id, record: { ...ref, facilityId: newFacilityId, status: 'pending', assignedAt: Date.now(), rerouteCount: (ref.rerouteCount || 0) + 1, escalatedNotified: false } }]);
            await db.add('events', [{ patientId: ref.patientId, ts: Date.now(), detail: `Rerouted from ${oldFacility?.name || 'previous facility'} to ${newFacility?.name || 'new facility'}` }]);
            await notifyRoleUsers('facility', newFacilityId, 'Incoming referral (reassigned)', 'A referral was rerouted to your facility', { referralId: ctx.params.id });
            await notifySubscribers('referrals', 'global', { resource: 'referrals' });
            await notifySubscribers('events', 'global', { resource: 'events' });
            return json({ ok: true });
        },
    ],

    'POST /api/referrals/:id/escalate': [
        requireAuth(),
        async (ctx) => {
            const [ref] = await db.get<any>('referrals', [ctx.params.id]);
            if (!ref) return error('Referral not found', 404);
            if (ref.escalatedNotified || ref.status !== 'pending') {
                return json({ ok: true, alreadyEscalated: true });
            }
            await db.update('referrals', [{ id: ctx.params.id, record: { ...ref, escalatedNotified: true } }]);
            const [patient] = await db.get<any>('patients', [ref.patientId]);
            const [facility] = await db.get<any>('facilities', [ref.facilityId]);
            await db.add('events', [{ patientId: ref.patientId, ts: Date.now(), detail: `No acknowledgment after ${ACK_SLA_MIN} min — escalated to district` }]);
            await notifyRoleUsers('district', undefined, 'Referral escalation', `${patient?.name || 'A patient'} — no acknowledgment from ${facility?.name || 'facility'}`, { referralId: ctx.params.id });
            await notifySubscribers('referrals', 'global', { resource: 'referrals' });
            await notifySubscribers('events', 'global', { resource: 'events' });
            return json({ ok: true });
        },
    ],

    'GET /api/events': [
        requireAuth(),
        async () => {
            const { items } = await db.list('events', { limit: 500 });
            return json({ events: items });
        },
    ],

    'POST /api/mothers': [
        requireAuth(),
        async (ctx) => {
            const profile = await findProfile(ctx.user!.userId);
            if (!profile || (profile.role !== 'chw' && profile.role !== 'facility')) {
                return error('Not authorized', 403);
            }
            const body = (ctx.body || {}) as Partial<Mother>;
            if (!body.phone) return error('phone is required');
            const record = await upsertMother(String(body.phone), {
                name: body.name,
                facilityId: body.facilityId || profile.facilityId,
                nextAppointmentDate: body.nextAppointmentDate,
                linkedPatientId: body.linkedPatientId,
                region: body.region,
            });
            return json({ mother: record });
        },
    ],

    ...realtimeSubscriptionRoutes,
});
