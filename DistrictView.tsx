import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowUpRight, Clock, Download, MapPin, Package, Phone } from 'lucide-react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import {
    COLORS, Card, SectionLabel, Tone, ElapsedClock, primaryBtn, ghostBtn, rowHeader, StatCard,
    computeRisk, facilityReadiness, distKmFrom, referralStatusInfo, COMMODITIES, stockStatus, ACK_SLA_MIN, REGIONS,
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

export default function DistrictView({ facilities, referrals, patients, onReroute }: any) {
    const [reassignOpenFor, setReassignOpenFor] = useState<string | null>(null);
    const centers = regionCenters(facilities);

    const criticalCommodities = facilities.flatMap((f: any) =>
        COMMODITIES.filter((c) => stockStatus(c.key, f.stock[c.key] ?? 0) === 'critical').map((c) => ({ facility: f, commodity: c }))
    );

    const pendingReferrals = referrals.filter((r: any) => r.status !== 'arrived');
    const reroutedReferrals = referrals.filter((r: any) => (r.rerouteCount || 0) > 0);
    const unacknowledged = referrals.filter((r: any) => r.status === 'pending' && (Date.now() - (r.assignedAt || r.createdAt)) / 60000 > ACK_SLA_MIN);
    const motherReported = referrals.filter((r: any) => r.source === 'mother_ussd');

    const avgResponseMin = useMemo(() => {
        const arrived = referrals.filter((r: any) => r.status === 'arrived' && r.arrivedAt);
        if (!arrived.length) return null;
        return Math.round(arrived.reduce((s: number, r: any) => s + (r.arrivedAt - r.createdAt) / 60000, 0) / arrived.length);
    }, [referrals]);

    const riskCounts = useMemo(() => {
        let high = 0, moderate = 0, low = 0;
        patients.forEach((p: any) => {
            const lvl = computeRisk(p.vitals).level;
            if (lvl === 'emergency' || lvl === 'high') high++;
            else if (lvl === 'moderate') moderate++;
            else low++;
        });
        return [
            { name: 'High risk', value: high, color: COLORS.rust },
            { name: 'Moderate', value: moderate, color: COLORS.amber },
            { name: 'Low', value: low, color: COLORS.green },
        ].filter((d) => d.value > 0);
    }, [patients]);

    const weeklyTrend = useMemo(() => {
        const days = Array.from({ length: 7 }, (_, i) => {
            const d = new Date();
            d.setDate(d.getDate() - (6 - i));
            d.setHours(0, 0, 0, 0);
            return d;
        });
        return days.map((d) => {
            const next = new Date(d);
            next.setDate(d.getDate() + 1);
            const count = referrals.filter((r: any) => r.createdAt >= d.getTime() && r.createdAt < next.getTime()).length;
            return { day: d.toLocaleDateString([], { month: 'short', day: 'numeric' }), count };
        });
    }, [referrals]);

    const stockTotals = COMMODITIES.map((c) => ({
        name: c.label,
        total: facilities.reduce((s: number, f: any) => s + (f.stock[c.key] ?? 0), 0),
    }));

    function exportCSV() {
        const rows = [['Patient', 'Age', 'Gest. weeks', 'Risk', 'Facility', 'Region', 'Status', 'Created', 'Rerouted', 'Source']];
        referrals.forEach((r: any) => {
            const p = patients.find((pt: any) => pt.id === r.patientId);
            const f = facilities.find((ft: any) => ft.id === r.facilityId);
            if (!p) return;
            rows.push([p.name, p.age, p.gestWeeks, computeRisk(p.vitals).label, f?.name || '', f?.region || '', r.status, new Date(r.createdAt).toISOString(), r.rerouteCount || 0, r.source === 'mother_ussd' ? 'Mother (USSD)' : 'CHW']);
        });
        const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `referrals-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                <SectionLabel
                    eyebrow="District oversight"
                    title="Visibility escalation"
                    subtitle="What the platform can do: surface the gap between clinical need and available response, fast enough to act on. What it can't do: move a truck or fund a procurement order."
                />
                <button onClick={exportCSV} style={{ ...primaryBtn, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Download size={13} /> Export CSV
                </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px,1fr))', gap: 14, marginBottom: 24 }}>
                <StatCard label="Facilities with critical stockout" value={new Set(criticalCommodities.map((c: any) => c.facility.id)).size} tone="rust" icon={Package} />
                <StatCard label={`Unacknowledged past ${ACK_SLA_MIN} min`} value={unacknowledged.length} tone="rust" icon={AlertTriangle} />
                <StatCard label="Rerouted after dispatch (should trend to zero)" value={reroutedReferrals.length} tone="rust" icon={ArrowUpRight} />
                <StatCard label="Reported by mothers via USSD" value={motherReported.length} tone="green" icon={Phone} />
                <StatCard label="Avg. time to facility arrival" value={avgResponseMin ? `${avgResponseMin}m` : '—'} tone="green" icon={Clock} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 20, marginBottom: 20 }} className="responsive-grid">
                <Card style={{ padding: 16 }}>
                    <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: COLORS.inkSoft, marginBottom: 10 }}>
                        Patients by risk tier
                    </div>
                    <ResponsiveContainer width="100%" height={180}>
                        <PieChart>
                            <Pie data={riskCounts} dataKey="value" nameKey="name" innerRadius={40} outerRadius={70} paddingAngle={2}>
                                {riskCounts.map((d, i) => (<Cell key={i} fill={d.color} />))}
                            </Pie>
                            <Tooltip />
                        </PieChart>
                    </ResponsiveContainer>
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center', marginTop: 6 }}>
                        {riskCounts.map((d) => (
                            <span key={d.name} style={{ fontSize: 11, color: COLORS.inkSoft, display: 'flex', alignItems: 'center', gap: 5 }}>
                                <span style={{ width: 8, height: 8, borderRadius: 8, background: d.color, display: 'inline-block' }} />
                                {d.name}: {d.value}
                            </span>
                        ))}
                    </div>
                </Card>

                <Card style={{ padding: 16 }}>
                    <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: COLORS.inkSoft, marginBottom: 10 }}>
                        Referrals — last 7 days (inclusive of today)
                    </div>
                    <ResponsiveContainer width="100%" height={180}>
                        <BarChart data={weeklyTrend}>
                            <CartesianGrid strokeDasharray="3 3" stroke={COLORS.rule} />
                            <XAxis dataKey="day" tick={{ fontSize: 11, fill: COLORS.inkSoft }} />
                            <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: COLORS.inkSoft }} />
                            <Tooltip />
                            <Bar dataKey="count" fill={COLORS.rust} radius={[3, 3, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </Card>
            </div>

            <Card style={{ padding: 16, marginBottom: 20 }}>
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: COLORS.inkSoft, marginBottom: 10 }}>
                    Total commodity stock across all facilities
                </div>
                <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={stockTotals} layout="vertical" margin={{ left: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={COLORS.rule} />
                        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: COLORS.inkSoft }} />
                        <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11, fill: COLORS.inkSoft }} />
                        <Tooltip />
                        <Bar dataKey="total" fill={COLORS.green} radius={[0, 3, 3, 0]} />
                    </BarChart>
                </ResponsiveContainer>
            </Card>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }} className="responsive-grid">
                <Card>
                    <div style={rowHeader}>Stockout escalation</div>
                    {criticalCommodities.length === 0 && <div style={{ padding: 20, fontSize: 13, color: COLORS.inkSoft }}>No critical stockouts right now.</div>}
                    {criticalCommodities.map((c: any, i: number) => (
                        <div key={i} style={{ padding: '12px 18px', borderTop: i === 0 ? 'none' : `1px solid ${COLORS.rule}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <div style={{ fontWeight: 600, fontSize: 13.5, color: COLORS.ink }}>{c.commodity.label}</div>
                                <div style={{ fontSize: 12, color: COLORS.inkSoft, display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <MapPin size={11} /> {c.facility.name}
                                </div>
                            </div>
                            <Tone tone="rust">{c.facility.stock[c.commodity.key]} {c.commodity.unit} left</Tone>
                        </div>
                    ))}
                </Card>

                <Card>
                    <div style={rowHeader}>Referrals by risk, worst first</div>
                    {pendingReferrals
                        .slice()
                        .sort((a: any, b: any) => a.createdAt - b.createdAt)
                        .map((r: any, i: number) => {
                            const p = patients.find((pt: any) => pt.id === r.patientId);
                            const f = facilities.find((ft: any) => ft.id === r.facilityId);
                            if (!p || !f) return null;
                            const statusInfo = referralStatusInfo(r);
                            const isStalled = r.status === 'pending' && (Date.now() - (r.assignedAt || r.createdAt)) / 60000 > ACK_SLA_MIN;
                            const needed = r.needed || ['oxytocin'];
                            const homeRegion = r.homeRegion || f.region;
                            const origin = centers[homeRegion];
                            const alternatives = facilities
                                .filter((alt: any) => alt.id !== f.id && alt.region === homeRegion)
                                .map((alt: any) => ({ ...alt, readiness: facilityReadiness(alt.stock, needed), distKm: distKmFrom(origin, alt) }))
                                .sort((a: any, b: any) => {
                                    if (a.readiness.ready !== b.readiness.ready) return a.readiness.ready ? -1 : 1;
                                    return (a.distKm ?? 0) - (b.distKm ?? 0);
                                });
                            return (
                                <div key={r.id} style={{ padding: '12px 18px', borderTop: i === 0 ? 'none' : `1px solid ${COLORS.rule}` }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                                        <div>
                                            <div style={{ fontWeight: 600, fontSize: 13.5, color: COLORS.ink, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                                {p.name}
                                                {r.source === 'mother_ussd' && <Tone tone="amber">USSD</Tone>}
                                            </div>
                                            <div style={{ fontSize: 12, color: COLORS.inkSoft }}>{f.name}</div>
                                            <Tone tone={statusInfo.tone} style={{ marginTop: 4 }}>{statusInfo.label}</Tone>
                                        </div>
                                        <ElapsedClock since={r.createdAt} sla={30} frozenAt={r.status === 'arrived' ? r.arrivedAt : undefined} />
                                    </div>

                                    {isStalled && (
                                        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                                            <a href={`tel:${f.phone.replace(/\s/g, '')}`} style={{ ...ghostBtn, display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}>
                                                Call {f.name} · {f.phone}
                                            </a>
                                            <button onClick={() => setReassignOpenFor(reassignOpenFor === r.id ? null : r.id)} style={{ ...ghostBtn, borderColor: COLORS.rust, color: COLORS.rust }}>
                                                Reassign facility
                                            </button>
                                        </div>
                                    )}

                                    {reassignOpenFor === r.id && (
                                        <div style={{ marginTop: 10, padding: 10, background: COLORS.paperDark, borderRadius: 3 }}>
                                            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: COLORS.inkSoft, marginBottom: 8, fontFamily: "'IBM Plex Mono', monospace" }}>
                                                Reassign — confirm by phone first if possible, this doesn't stop her transport
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
                                                            <button onClick={async () => { await onReroute(r.id, alt.id); setReassignOpenFor(null); }} style={{ ...primaryBtn, padding: '6px 10px', fontSize: 11.5 }}>
                                                                Reassign here
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
                    {pendingReferrals.length === 0 && <div style={{ padding: 20, fontSize: 13, color: COLORS.inkSoft }}>No pending referrals.</div>}
                </Card>
            </div>
        </div>
    );
}
