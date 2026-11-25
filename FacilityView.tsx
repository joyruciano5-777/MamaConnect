import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import {
    COLORS, Card, SectionLabel, Tone, ElapsedClock, inputStyle, primaryBtn, ghostBtn, qtyBtn,
    computeRisk, facilityReadiness, distKmFrom, COMMODITIES, stockStatus, REGIONS,
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

function patientMeta(p: any, rerouteCount: number) {
    return [p.age > 0 ? `${p.age}y` : null, p.gestWeeks > 0 ? `${p.gestWeeks}wk` : null, rerouteCount > 0 ? `rerouted ${rerouteCount}×` : null].filter(Boolean).join(' · ');
}

export default function FacilityView({ facilities, patients, referrals, lockedFacilityId, onUpdateStock, onAcknowledge, onArrived, onReroute }: any) {
    const [facilityId, setFacilityId] = useState(lockedFacilityId || facilities[0]?.id || '');
    const [rerouteOpenFor, setRerouteOpenFor] = useState<string | null>(null);
    const centers = regionCenters(facilities);

    if (facilities.length === 0) {
        return <div style={{ padding: 20, color: COLORS.inkSoft, fontSize: 13 }}>Loading facilities…</div>;
    }

    const effectiveFacilityId = lockedFacilityId || facilityId;
    const facility = facilities.find((f: any) => f.id === effectiveFacilityId) || facilities[0];
    const incoming = referrals.filter((r: any) => r.facilityId === facility.id);

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 }}>
                <SectionLabel
                    eyebrow="Facility desk"
                    title="Incoming referrals & commodity ledger"
                    subtitle="Acknowledging a referral doesn't clear the mother to travel — she's already moving. It tells the facility to prepare before she arrives. Silence past 10 minutes escalates to the district automatically."
                />
                {!lockedFacilityId && (
                    <select value={facilityId} onChange={(e) => setFacilityId(e.target.value)} style={{ ...inputStyle, height: 40 }}>
                        {facilities.map((f: any) => (
                            <option key={f.id} value={f.id}>{f.name}</option>
                        ))}
                    </select>
                )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 20, alignItems: 'start' }} className="responsive-grid">
                <Card>
                    <div style={{ padding: '12px 18px', borderBottom: `1px solid ${COLORS.rule}`, fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: COLORS.inkSoft }}>
                        Referrals — {facility.name}
                    </div>
                    {incoming.length === 0 && <div style={{ padding: 24, color: COLORS.inkSoft, fontSize: 13 }}>No active referrals for this facility.</div>}
                    {incoming.map((r: any, i: number) => {
                        const p = patients.find((pt: any) => pt.id === r.patientId);
                        if (!p) return null;
                        const risk = computeRisk(p.vitals);
                        const needed = r.needed || ['oxytocin'];
                        const readiness = facilityReadiness(facility.stock, needed);
                        const homeRegion = r.homeRegion || facility.region;
                        const origin = centers[homeRegion];
                        const alternatives = facilities
                            .filter((f: any) => f.id !== facility.id && f.region === homeRegion)
                            .map((f: any) => ({ ...f, readiness: facilityReadiness(f.stock, needed), distKm: distKmFrom(origin, f) }))
                            .sort((a: any, b: any) => {
                                if (a.readiness.ready !== b.readiness.ready) return a.readiness.ready ? -1 : 1;
                                return (a.distKm ?? 0) - (b.distKm ?? 0);
                            });
                        return (
                            <div key={r.id} style={{ padding: '14px 18px', borderTop: i === 0 ? 'none' : `1px solid ${COLORS.rule}` }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                                    <div>
                                        <div style={{ fontWeight: 600, color: COLORS.ink, fontSize: 14.5, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                            {p.name}
                                            {p.createdByUserId === 'ussd' && <Tone tone="amber">Self-reported · USSD</Tone>}
                                        </div>
                                        <div style={{ fontSize: 12, color: COLORS.inkSoft }}>{patientMeta(p, r.rerouteCount || 0)}</div>
                                    </div>
                                    <Tone tone={risk.tone}>{risk.label}</Tone>
                                </div>

                                <div style={{ marginTop: 8 }}>
                                    {readiness.ready ? (
                                        <Tone tone="green">This facility has what's needed</Tone>
                                    ) : (
                                        <Tone tone="rust">
                                            Cannot fully treat here — missing {needed.filter((k: string) => readiness.missing.includes(k)).map((k: string) => COMMODITIES.find((c) => c.key === k)?.label).join(', ')}
                                        </Tone>
                                    )}
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, flexWrap: 'wrap', gap: 8 }}>
                                    <ElapsedClock since={r.createdAt} sla={30} frozenAt={r.status === 'arrived' ? r.arrivedAt : undefined} />
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        {r.status === 'pending' && <button onClick={() => onAcknowledge(r.id)} style={{ ...ghostBtn }}>Acknowledge</button>}
                                        {!readiness.ready && (
                                            <button onClick={() => setRerouteOpenFor(rerouteOpenFor === r.id ? null : r.id)} style={{ ...ghostBtn, borderColor: COLORS.rust, color: COLORS.rust }}>
                                                Reroute
                                            </button>
                                        )}
                                        {r.status !== 'arrived' && (
                                            <button onClick={() => onArrived(r.id)} style={{ ...primaryBtn, padding: '7px 12px', fontSize: 12 }}>Mark arrived</button>
                                        )}
                                        {r.status === 'arrived' && <Tone tone="green"><CheckCircle2 size={12} /> Arrived</Tone>}
                                    </div>
                                </div>

                                {rerouteOpenFor === r.id && (
                                    <div style={{ marginTop: 10, padding: 10, background: COLORS.paperDark, borderRadius: 3 }}>
                                        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: COLORS.inkSoft, marginBottom: 8, fontFamily: "'IBM Plex Mono', monospace" }}>
                                            Reroute — original wait time carries over, it does not reset
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                            {alternatives.map((alt: any) => (
                                                <div key={alt.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: '#FFFEFB', border: `1px solid ${COLORS.rule}`, borderRadius: 3, flexWrap: 'wrap', gap: 8 }}>
                                                    <div>
                                                        <div style={{ fontSize: 12.5, fontWeight: 600, color: COLORS.ink }}>{alt.name}</div>
                                                        <div style={{ fontSize: 11, color: COLORS.inkSoft }}>{alt.region} · {alt.distKm} km</div>
                                                    </div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                        <Tone tone={alt.readiness.ready ? 'green' : 'rust'}>{alt.readiness.ready ? 'Ready' : 'Missing'}</Tone>
                                                        <button onClick={async () => { await onReroute(r.id, alt.id); setRerouteOpenFor(null); }} style={{ ...primaryBtn, padding: '6px 10px', fontSize: 11.5 }}>
                                                            Send here
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </Card>

                <Card>
                    <div style={{ padding: '12px 18px', borderBottom: `1px solid ${COLORS.rule}`, fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: COLORS.inkSoft }}>
                        Emergency obstetric stock
                    </div>
                    {COMMODITIES.map((c, i) => {
                        const qty = facility.stock[c.key] ?? 0;
                        const status = stockStatus(c.key, qty);
                        const pct = Math.min(100, (qty / (c.low * 2)) * 100);
                        return (
                            <div key={c.key} style={{ padding: '12px 18px', borderTop: i === 0 ? 'none' : `1px solid ${COLORS.rule}` }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                                    <span style={{ fontSize: 13, fontWeight: 500, color: COLORS.ink }}>{c.label}</span>
                                    <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: COLORS.inkSoft }}>{qty} {c.unit}</span>
                                </div>
                                <div style={{ height: 6, background: COLORS.paperDark, borderRadius: 3, overflow: 'hidden', marginBottom: 8 }}>
                                    <div style={{ height: '100%', width: `${pct}%`, background: status === 'critical' ? COLORS.rust : status === 'low' ? COLORS.amber : COLORS.green }} />
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Tone tone={status === 'critical' ? 'rust' : status === 'low' ? 'amber' : 'green'}>
                                        {status === 'critical' ? 'Critical' : status === 'low' ? 'Low' : 'In stock'}
                                    </Tone>
                                    <div style={{ display: 'flex', gap: 6 }}>
                                        <button onClick={() => onUpdateStock(facility.id, c.key, -1)} style={qtyBtn}>–</button>
                                        <button onClick={() => onUpdateStock(facility.id, c.key, 1)} style={qtyBtn}>+</button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </Card>
            </div>
        </div>
    );
}
