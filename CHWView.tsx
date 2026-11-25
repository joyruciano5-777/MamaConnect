import { useMemo, useState } from 'react';
import { History, Plus, X } from 'lucide-react';
import {
    COLORS, Card, SectionLabel, Tone, ElapsedClock, inputStyle, primaryBtn, ghostBtn,
    computeRisk, requiredCommodities, facilityReadiness, distKmFrom, referralStatusInfo,
    COMMODITIES, ACK_SLA_MIN, REGIONS,
} from '../lib/shared';

function regionCenters(facilities: any[]) {
    const centers: Record<string, { lat: number; lng: number }> = {};
    REGIONS.forEach((region) => {
        const inRegion = facilities.filter((f) => f.region === region);
        if (inRegion.length === 0) return;
        centers[region] = {
            lat: inRegion.reduce((s, f) => s + f.lat, 0) / inRegion.length,
            lng: inRegion.reduce((s, f) => s + f.lng, 0) / inRegion.length,
        };
    });
    return centers;
}

function patientMeta(p: any, fac: any) {
    return [p.age > 0 ? `${p.age}y` : null, p.gestWeeks > 0 ? `${p.gestWeeks}wk` : null, fac?.name].filter(Boolean).join(' · ');
}

export default function CHWView({ patients, facilities, referrals, events, onAddPatient, onReroute }: any) {
    const [showForm, setShowForm] = useState(false);
    const [reassignOpenFor, setReassignOpenFor] = useState<string | null>(null);
    const [historyOpenFor, setHistoryOpenFor] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    const centers = useMemo(() => regionCenters(facilities), [facilities]);

    const emptyForm = {
        name: '', age: '', gestWeeks: '',
        region: facilities[0]?.region || REGIONS[0],
        facilityId: facilities[0]?.id || '',
        systolic: '', diastolic: '',
        bleeding: false, convulsions: false, severeHeadache: false, fever: false,
        reducedFetalMovement: false, prolongedLabor: false, otherSymptom: '',
        motherPhone: '', nextAppointmentDate: '',
    };
    const [form, setForm] = useState(emptyForm);

    const currentVitals = {
        systolic: Number(form.systolic) || 0,
        diastolic: Number(form.diastolic) || 0,
        bleeding: form.bleeding,
        convulsions: form.convulsions,
        severeHeadache: form.severeHeadache,
        fever: form.fever,
        reducedFetalMovement: form.reducedFetalMovement,
        prolongedLabor: form.prolongedLabor,
        otherSymptom: form.otherSymptom,
    };
    const preview = useMemo(() => computeRisk(currentVitals), [form]);
    const needed = requiredCommodities(currentVitals);

    const regionFacilities = useMemo(() => {
        const origin = centers[form.region];
        return facilities
            .filter((f: any) => f.region === form.region)
            .map((f: any) => ({ ...f, readiness: facilityReadiness(f.stock, needed), distKm: distKmFrom(origin, f) }))
            .sort((a: any, b: any) => {
                if (a.readiness.ready !== b.readiness.ready) return a.readiness.ready ? -1 : 1;
                return (a.distKm ?? 0) - (b.distKm ?? 0);
            });
    }, [facilities, form.region, needed, centers]);

    if (facilities.length === 0) {
        return <div style={{ padding: 20, color: COLORS.inkSoft, fontSize: 13 }}>Loading facilities…</div>;
    }

    async function submit() {
        if (!form.name || !form.age || !form.gestWeeks || submitting) return;
        setSubmitting(true);
        try {
            await onAddPatient({
                name: form.name, age: form.age, gestWeeks: form.gestWeeks, facilityId: form.facilityId,
                systolic: form.systolic, diastolic: form.diastolic,
                bleeding: form.bleeding, convulsions: form.convulsions, severeHeadache: form.severeHeadache,
                fever: form.fever, reducedFetalMovement: form.reducedFetalMovement, prolongedLabor: form.prolongedLabor,
                otherSymptom: form.otherSymptom,
                motherPhone: form.motherPhone, nextAppointmentDate: form.nextAppointmentDate,
            });
            setShowForm(false);
            setForm(emptyForm);
        } finally {
            setSubmitting(false);
        }
    }

    const checkbox = (key: string, label: string) => (
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', border: `1px solid ${(form as any)[key] ? COLORS.rust : COLORS.rule}`, borderRadius: 3, background: (form as any)[key] ? COLORS.rustSoft : 'transparent', cursor: 'pointer', fontSize: 12.5, color: COLORS.ink }}>
            <input type="checkbox" checked={(form as any)[key]} onChange={(e) => setForm({ ...form, [key]: e.target.checked })} style={{ accentColor: COLORS.rust }} />
            {label}
        </label>
    );

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 }}>
                <SectionLabel
                    eyebrow="CHW register"
                    title="Field assessment"
                    subtitle="Score against WHO danger signs. Every result ends in one action — refer, monitor, or continue routine care. Referrals sync to the facility and district in real time."
                />
                <button
                    onClick={() => setShowForm((s) => !s)}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, background: COLORS.ink, color: COLORS.paper, border: 'none', padding: '10px 16px', borderRadius: 3, fontFamily: "'IBM Plex Sans', sans-serif", fontSize: 13, fontWeight: 500, cursor: 'pointer', height: 40 }}
                >
                    {showForm ? <X size={15} /> : <Plus size={15} />}
                    {showForm ? 'Close form' : 'New assessment'}
                </button>
            </div>

            {showForm && (
                <Card style={{ padding: 20, marginBottom: 24 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px,1fr))', gap: 12, marginBottom: 14 }}>
                        <input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={inputStyle} />
                        <input placeholder="Age" type="number" value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value })} style={inputStyle} />
                        <input placeholder="Gestational weeks" type="number" value={form.gestWeeks} onChange={(e) => setForm({ ...form, gestWeeks: e.target.value })} style={inputStyle} />
                        <input placeholder="Systolic BP" type="number" value={form.systolic} onChange={(e) => setForm({ ...form, systolic: e.target.value })} style={inputStyle} />
                        <input placeholder="Diastolic BP" type="number" value={form.diastolic} onChange={(e) => setForm({ ...form, diastolic: e.target.value })} style={inputStyle} />
                    </div>

                    <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: COLORS.inkSoft, marginBottom: 8, fontFamily: "'IBM Plex Mono', monospace" }}>
                        Danger signs observed
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px,1fr))', gap: 8, marginBottom: 10 }}>
                        {checkbox('bleeding', 'Vaginal bleeding')}
                        {checkbox('convulsions', 'Convulsions')}
                        {checkbox('severeHeadache', 'Severe headache / blurred vision')}
                        {checkbox('fever', 'Fever')}
                        {checkbox('reducedFetalMovement', 'Reduced fetal movement')}
                        {checkbox('prolongedLabor', 'Prolonged labor')}
                    </div>
                    <input
                        placeholder="Other — describe anything not listed above (forces at least Monitor tier)"
                        value={form.otherSymptom}
                        onChange={(e) => setForm({ ...form, otherSymptom: e.target.value })}
                        style={{ ...inputStyle, width: '100%', boxSizing: 'border-box', marginBottom: 18 }}
                    />

                    <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: COLORS.inkSoft, marginBottom: 8, fontFamily: "'IBM Plex Mono', monospace" }}>
                        Mother's phone — optional, lets her check in and get reminders by USSD
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px,1fr))', gap: 12, marginBottom: 18 }}>
                        <input placeholder="Phone e.g. 0712345678" value={form.motherPhone} onChange={(e) => setForm({ ...form, motherPhone: e.target.value })} style={inputStyle} />
                        <input placeholder="Next appointment date" type="date" value={form.nextAppointmentDate} onChange={(e) => setForm({ ...form, nextAppointmentDate: e.target.value })} style={inputStyle} />
                    </div>

                    <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: COLORS.inkSoft, marginBottom: 8, fontFamily: "'IBM Plex Mono', monospace" }}>
                        Refer to — ranked by stock readiness for this patient, then distance
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                        {REGIONS.map((r) => (
                            <button
                                key={r}
                                onClick={() => setForm({ ...form, region: r, facilityId: facilities.find((f: any) => f.region === r)?.id || '' })}
                                style={{ ...ghostBtn, background: form.region === r ? COLORS.ink : 'transparent', color: form.region === r ? COLORS.paper : COLORS.ink, borderColor: form.region === r ? COLORS.ink : COLORS.rule }}
                            >
                                {r}
                            </button>
                        ))}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 18 }}>
                        {regionFacilities.map((f: any) => (
                            <label key={f.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', border: `1px solid ${form.facilityId === f.id ? COLORS.rust : COLORS.rule}`, background: form.facilityId === f.id ? COLORS.rustSoft : 'transparent', borderRadius: 3, cursor: 'pointer', gap: 10, flexWrap: 'wrap' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <input type="radio" name="facility" checked={form.facilityId === f.id} onChange={() => setForm({ ...form, facilityId: f.id })} style={{ accentColor: COLORS.rust }} />
                                    <div>
                                        <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>{f.name}</div>
                                        <div style={{ fontSize: 11.5, color: COLORS.inkSoft }}>{f.level} · {f.distKm} km away</div>
                                    </div>
                                </div>
                                {f.readiness.ready ? (
                                    <Tone tone="green">Stock ready</Tone>
                                ) : (
                                    <Tone tone="rust">Missing {f.readiness.missing.map((k: string) => COMMODITIES.find((c) => c.key === k)?.label).join(', ')}</Tone>
                                )}
                            </label>
                        ))}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 12, color: COLORS.inkSoft }}>Live result:</span>
                            <Tone tone={preview.tone}>{preview.label}</Tone>
                        </div>
                        <button onClick={submit} disabled={submitting} style={primaryBtn}>
                            {submitting ? 'Saving…' : `Save assessment${preview.level === 'emergency' || preview.level === 'high' ? ' & trigger referral' : ''}`}
                        </button>
                    </div>
                </Card>
            )}

            <Card>
                {patients
                    .slice()
                    .sort((a: any, b: any) => b.createdAt - a.createdAt)
                    .map((p: any, i: number) => {
                        const risk = computeRisk(p.vitals);
                        const ref = referrals.find((r: any) => r.patientId === p.id);
                        const fac = facilities.find((f: any) => f.id === (ref ? ref.facilityId : p.facilityId));
                        const isStalled = ref && ref.status === 'pending' && (Date.now() - (ref.assignedAt || ref.createdAt)) / 60000 > ACK_SLA_MIN;
                        const needed2 = ref ? ref.needed || ['oxytocin'] : [];
                        const homeRegion = ref ? ref.homeRegion || fac?.region : null;
                        const origin = homeRegion ? centers[homeRegion] : null;
                        const alternatives = ref
                            ? facilities
                                  .filter((f: any) => f.id !== ref.facilityId && f.region === homeRegion)
                                  .map((f: any) => ({ ...f, readiness: facilityReadiness(f.stock, needed2), distKm: distKmFrom(origin, f) }))
                                  .sort((a: any, b: any) => {
                                      if (a.readiness.ready !== b.readiness.ready) return a.readiness.ready ? -1 : 1;
                                      return (a.distKm ?? 0) - (b.distKm ?? 0);
                                  })
                            : [];
                        const patientEvents = events.filter((e: any) => e.patientId === p.id).sort((a: any, b: any) => a.ts - b.ts);
                        return (
                            <div key={p.id} style={{ padding: '14px 18px', borderTop: i === 0 ? 'none' : `1px solid ${COLORS.rule}` }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                                    <div>
                                        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: COLORS.inkSoft }}>
                                            {new Date(p.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                        </div>
                                        <div style={{ fontWeight: 600, color: COLORS.ink, fontSize: 14.5, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                            {p.name}
                                            {p.createdByUserId === 'ussd' && <Tone tone="amber">Self-reported · USSD</Tone>}
                                        </div>
                                        <div style={{ fontSize: 12, color: COLORS.inkSoft }}>{patientMeta(p, fac)}</div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                                        {ref && (
                                            <>
                                                <ElapsedClock since={ref.createdAt} sla={30} frozenAt={ref.status === 'arrived' ? ref.arrivedAt : undefined} />
                                                <Tone tone={referralStatusInfo(ref).tone}>{referralStatusInfo(ref).label}</Tone>
                                            </>
                                        )}
                                        <Tone tone={risk.tone}>{risk.label}</Tone>
                                        <button onClick={() => setHistoryOpenFor(historyOpenFor === p.id ? null : p.id)} style={{ ...ghostBtn, display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 10px' }}>
                                            <History size={12} /> History
                                        </button>
                                    </div>
                                </div>

                                {ref && ref.status !== 'arrived' && (
                                    <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                                        <a href={`tel:${fac?.phone?.replace(/\s/g, '')}`} style={{ ...ghostBtn, display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}>
                                            Call {fac?.name} · {fac?.phone}
                                        </a>
                                        {isStalled && (
                                            <button onClick={() => setReassignOpenFor(reassignOpenFor === ref.id ? null : ref.id)} style={{ ...ghostBtn, borderColor: COLORS.rust, color: COLORS.rust }}>
                                                Reassign facility
                                            </button>
                                        )}
                                    </div>
                                )}

                                {ref && reassignOpenFor === ref.id && (
                                    <div style={{ marginTop: 10, padding: 10, background: COLORS.paperDark, borderRadius: 3 }}>
                                        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: COLORS.inkSoft, marginBottom: 8, fontFamily: "'IBM Plex Mono', monospace" }}>
                                            Reassign — same county only, ranked by stock readiness then distance
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                            {alternatives.length === 0 && (
                                                <div style={{ fontSize: 12, color: COLORS.inkSoft, padding: '6px 2px' }}>No other facility in {homeRegion} to reassign to.</div>
                                            )}
                                            {alternatives.map((alt: any) => (
                                                <div key={alt.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: '#FFFEFB', border: `1px solid ${COLORS.rule}`, borderRadius: 3, flexWrap: 'wrap', gap: 8 }}>
                                                    <div>
                                                        <div style={{ fontSize: 12.5, fontWeight: 600, color: COLORS.ink }}>{alt.name}</div>
                                                        <div style={{ fontSize: 11, color: COLORS.inkSoft }}>{alt.region} · {alt.distKm} km</div>
                                                    </div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                        <Tone tone={alt.readiness.ready ? 'green' : 'rust'}>{alt.readiness.ready ? 'Ready' : 'Missing'}</Tone>
                                                        <button onClick={async () => { await onReroute(ref.id, alt.id); setReassignOpenFor(null); }} style={{ ...primaryBtn, padding: '6px 10px', fontSize: 11.5 }}>
                                                            Send here
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {historyOpenFor === p.id && (
                                    <div style={{ marginTop: 10, padding: 10, background: COLORS.paperDark, borderRadius: 3 }}>
                                        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: COLORS.inkSoft, marginBottom: 8, fontFamily: "'IBM Plex Mono', monospace" }}>
                                            Case history — {p.name}
                                        </div>
                                        {patientEvents.length === 0 ? (
                                            <div style={{ fontSize: 12, color: COLORS.inkSoft }}>No events logged yet.</div>
                                        ) : (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                                {patientEvents.map((e: any) => (
                                                    <div key={e.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                                                        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: COLORS.inkSoft, minWidth: 100 }}>
                                                            {new Date(e.ts).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                        </div>
                                                        <div style={{ fontSize: 12.5, color: COLORS.ink }}>{e.detail}</div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                {patients.length === 0 && <div style={{ padding: 20, fontSize: 13, color: COLORS.inkSoft }}>No assessments recorded yet.</div>}
            </Card>
        </div>
    );
}
