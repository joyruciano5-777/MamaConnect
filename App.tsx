import { useEffect, useRef, useState } from 'react';
import { api, auth, ws } from '@appdeploy/client';
import { Stethoscope, Building2, Map as MapIcon, LayoutGrid, LogOut, ArrowLeft } from 'lucide-react';
import { COLORS, FONT_IMPORT, Card, SectionLabel, primaryBtn, ghostBtn, ACK_SLA_MIN } from './lib/shared';
import CHWView from './views/CHWView';
import FacilityView from './views/FacilityView';
import MapView from './views/MapView';
import DistrictView from './views/DistrictView';

type Role = 'chw' | 'facility' | 'district';

interface Profile {
    role: Role;
    facilityId?: string;
    name?: string;
}

const roleCardStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    padding: '16px 18px',
    border: `1px solid ${COLORS.rule}`,
    borderRadius: 4,
    background: '#FFFEFB',
    cursor: 'pointer',
    textAlign: 'left',
    width: '100%',
    fontFamily: "'IBM Plex Sans', sans-serif",
};

function App() {
    const [authChecked, setAuthChecked] = useState(false);
    const [user, setUser] = useState<any>(null);
    const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
    const [facilities, setFacilities] = useState<any[]>([]);
    const [patients, setPatients] = useState<any[]>([]);
    const [referrals, setReferrals] = useState<any[]>([]);
    const [events, setEvents] = useState<any[]>([]);
    const [tab, setTab] = useState<string>('chw');
    const [pickingFacilityFor, setPickingFacilityFor] = useState<Role | null>(null);
    const [saving, setSaving] = useState(false);
    const wsRef = useRef<any>(null);
    const referralsRef = useRef<any[]>([]);

    useEffect(() => {
        (async () => {
            const u = await auth.getUser();
            setUser(u);
            setAuthChecked(true);
        })();
    }, []);

    useEffect(() => {
        referralsRef.current = referrals;
    }, [referrals]);

    async function refetchAll() {
        const [f, p, r, e] = await Promise.all([
            api.get('/api/facilities'),
            api.get('/api/patients'),
            api.get('/api/referrals'),
            api.get('/api/events'),
        ]);
        setFacilities(f.data.facilities || []);
        setPatients(p.data.patients || []);
        setReferrals(r.data.referrals || []);
        setEvents(e.data.events || []);
    }

    async function loadProfile() {
        const res = await api.get('/api/profile');
        setProfile(res.data.profile);
    }

    useEffect(() => {
        if (!user) return;
        loadProfile();
        api.get('/api/facilities').then((r) => setFacilities(r.data.facilities || []));
    }, [user]);

    useEffect(() => {
        if (!user || profile === undefined || profile === null) return;
        refetchAll();

        const conn = ws.connect();
        wsRef.current = conn;
        conn.onMessage((msg: any) => {
            if (msg?.type !== 'entity.update') return;
            const resource = msg.payload?.data?.resource;
            if (resource === 'facilities') api.get('/api/facilities').then((r) => setFacilities(r.data.facilities || []));
            if (resource === 'patients') api.get('/api/patients').then((r) => setPatients(r.data.patients || []));
            if (resource === 'referrals') api.get('/api/referrals').then((r) => setReferrals(r.data.referrals || []));
            if (resource === 'events') api.get('/api/events').then((r) => setEvents(r.data.events || []));
        });
        conn.ready.then(() => {
            const connection_id = conn.connectionId;
            ['facilities', 'patients', 'referrals', 'events'].forEach((entity_type) => {
                api.post('/api/subscriptions', { entity_type, entity_id: 'global', connection_id });
            });
        });

        return () => {
            conn.disconnect();
        };
    }, [user, profile]);

    useEffect(() => {
        const t = setInterval(() => {
            const overdue = referralsRef.current.filter(
                (r: any) => r.status === 'pending' && !r.escalatedNotified && (Date.now() - (r.assignedAt || r.createdAt)) / 60000 > ACK_SLA_MIN
            );
            overdue.forEach((r: any) => {
                api.post(`/api/referrals/${r.id}/escalate`, {}).catch(() => {});
            });
        }, 30000);
        return () => clearInterval(t);
    }, []);

    async function handleSignIn() {
        const result = await auth.signIn();
        setUser(result.user);
    }

    async function handleSignOut() {
        wsRef.current?.disconnect();
        await auth.signOut();
        setUser(null);
        setProfile(undefined);
    }

    function switchRole() {
        setProfile(null);
        setPickingFacilityFor(null);
    }

    async function submitOnboarding(role: Role, facilityId?: string) {
        setSaving(true);
        try {
            const res = await api.post('/api/profile', { role, facilityId });
            setProfile(res.data.profile);
            setPickingFacilityFor(null);
        } finally {
            setSaving(false);
        }
    }

    async function addPatient(payload: any) {
        const res = await api.post('/api/patients', payload);
        return res.data;
    }
    async function updateStock(facilityId: string, key: string, delta: number) {
        await api.put(`/api/facilities/${facilityId}/stock`, { key, delta });
    }
    async function acknowledgeReferral(id: string) {
        await api.post(`/api/referrals/${id}/acknowledge`, {});
    }
    async function markArrived(id: string) {
        await api.post(`/api/referrals/${id}/arrived`, {});
    }
    async function rerouteReferral(id: string, newFacilityId: string) {
        await api.post(`/api/referrals/${id}/reroute`, { newFacilityId });
    }

    if (!authChecked) {
        return <div style={{ minHeight: '100vh', background: COLORS.paper }} />;
    }

    if (!user) {
        return (
            <div style={{ minHeight: '100vh', background: COLORS.paper, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'IBM Plex Sans', sans-serif", padding: 20 }}>
                <style>{FONT_IMPORT}</style>
                <Card style={{ padding: 32, maxWidth: 380, textAlign: 'center' }}>
                    <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: COLORS.rust, marginBottom: 8 }}>
                        Three Delays Platform
                    </div>
                    <div style={{ fontFamily: "'Roboto Slab', serif", fontSize: 24, fontWeight: 700, color: COLORS.ink, marginBottom: 16 }}>
                        MamaConnect
                    </div>
                    <p style={{ fontSize: 14, color: COLORS.inkSoft, marginBottom: 22, lineHeight: 1.5 }}>
                        One tap to sign in. Then tell us your role.
                    </p>
                    <button onClick={handleSignIn} style={{ ...primaryBtn, width: '100%', padding: '14px 16px', fontSize: 15 }}>Sign in</button>
                </Card>
            </div>
        );
    }

    if (profile === undefined) {
        return <div style={{ minHeight: '100vh', background: COLORS.paper }} />;
    }

    if (profile === null) {
        return (
            <div style={{ minHeight: '100vh', background: COLORS.paper, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'IBM Plex Sans', sans-serif", padding: 20 }}>
                <style>{FONT_IMPORT}</style>
                <Card style={{ padding: 26, maxWidth: 440, width: '100%' }}>
                    <SectionLabel eyebrow="One-time setup" title={pickingFacilityFor ? 'Which facility?' : 'Who are you?'} />

                    {!pickingFacilityFor && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <button onClick={() => setPickingFacilityFor('chw')} style={roleCardStyle}>
                                <Stethoscope size={26} color={COLORS.rust} />
                                <div>
                                    <div style={{ fontSize: 15.5, fontWeight: 600, color: COLORS.ink }}>Community Health Worker</div>
                                    <div style={{ fontSize: 12.5, color: COLORS.inkSoft }}>I visit mothers and record assessments</div>
                                </div>
                            </button>
                            <button onClick={() => setPickingFacilityFor('facility')} style={roleCardStyle}>
                                <Building2 size={26} color={COLORS.rust} />
                                <div>
                                    <div style={{ fontSize: 15.5, fontWeight: 600, color: COLORS.ink }}>Facility staff</div>
                                    <div style={{ fontSize: 12.5, color: COLORS.inkSoft }}>I receive referrals and manage stock</div>
                                </div>
                            </button>
                            <button onClick={() => submitOnboarding('district')} disabled={saving} style={roleCardStyle}>
                                <LayoutGrid size={26} color={COLORS.rust} />
                                <div>
                                    <div style={{ fontSize: 15.5, fontWeight: 600, color: COLORS.ink }}>District oversight</div>
                                    <div style={{ fontSize: 12.5, color: COLORS.inkSoft }}>I monitor referrals and stock across facilities</div>
                                </div>
                            </button>
                        </div>
                    )}

                    {pickingFacilityFor && (
                        <div>
                            <button onClick={() => setPickingFacilityFor(null)} style={{ ...ghostBtn, display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
                                <ArrowLeft size={13} /> Back
                            </button>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 340, overflowY: 'auto' }}>
                                {facilities.length === 0 && <div style={{ fontSize: 13, color: COLORS.inkSoft, padding: '8px 2px' }}>Loading facilities…</div>}
                                {facilities.map((f: any) => (
                                    <button key={f.id} onClick={() => submitOnboarding(pickingFacilityFor, f.id)} disabled={saving} style={roleCardStyle}>
                                        <div>
                                            <div style={{ fontSize: 14.5, fontWeight: 600, color: COLORS.ink }}>{f.name}</div>
                                            <div style={{ fontSize: 12, color: COLORS.inkSoft }}>{f.level} · {f.region}</div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </Card>
            </div>
        );
    }

    const availableTabs =
        profile.role === 'chw'
            ? [{ id: 'chw', label: 'CHW', icon: Stethoscope }]
            : profile.role === 'facility'
            ? [{ id: 'facility', label: 'Facility', icon: Building2 }]
            : [
                  { id: 'district', label: 'District', icon: LayoutGrid },
                  { id: 'map', label: 'Map', icon: MapIcon },
                  { id: 'facility', label: 'Facility', icon: Building2 },
              ];

    const activeTab = availableTabs.find((t) => t.id === tab) ? tab : availableTabs[0].id;

    return (
        <div style={{ background: COLORS.paper, minHeight: '100vh', fontFamily: "'IBM Plex Sans', sans-serif" }}>
            <style>{FONT_IMPORT}{`
        @media (max-width: 760px) { .responsive-grid { grid-template-columns: 1fr !important; } }
        input:focus, select:focus, button:focus-visible { outline: 2px solid ${COLORS.rust}; outline-offset: 1px; }
      `}</style>

            <header style={{ borderBottom: `1px solid ${COLORS.rule}`, padding: '22px 28px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16, maxWidth: 1100, margin: '0 auto' }}>
                    <div>
                        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: COLORS.rust, marginBottom: 4 }}>
                            Three Delays Platform · {profile.role === 'chw' ? 'CHW' : profile.role === 'facility' ? 'Facility' : 'District'}
                        </div>
                        <div style={{ fontFamily: "'Roboto Slab', serif", fontSize: 24, fontWeight: 700, color: COLORS.ink }}>
                            MamaConnect
                        </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <nav style={{ display: 'flex', gap: 4, background: COLORS.paperDark, padding: 4, borderRadius: 4 }}>
                            {availableTabs.map((t) => {
                                const Icon = t.icon;
                                const active = activeTab === t.id;
                                return (
                                    <button
                                        key={t.id}
                                        onClick={() => setTab(t.id)}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 3, border: 'none',
                                            background: active ? COLORS.ink : 'transparent', color: active ? COLORS.paper : COLORS.inkSoft,
                                            fontFamily: "'IBM Plex Sans', sans-serif", fontSize: 13, fontWeight: 500, cursor: 'pointer',
                                        }}
                                    >
                                        <Icon size={14} />
                                        {t.label}
                                    </button>
                                );
                            })}
                        </nav>
                        <button onClick={switchRole} style={{ ...ghostBtn, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            Switch role
                        </button>
                        <button onClick={handleSignOut} style={{ ...ghostBtn, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <LogOut size={13} /> Sign out
                        </button>
                    </div>
                </div>
            </header>

            <main style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 28px 60px' }}>
                {activeTab === 'chw' && (
                    <CHWView patients={patients} facilities={facilities} referrals={referrals} events={events} onAddPatient={addPatient} onReroute={rerouteReferral} />
                )}
                {activeTab === 'facility' && (
                    <FacilityView
                        facilities={facilities}
                        patients={patients}
                        referrals={referrals}
                        lockedFacilityId={profile.role === 'facility' ? profile.facilityId : undefined}
                        onUpdateStock={updateStock}
                        onAcknowledge={acknowledgeReferral}
                        onArrived={markArrived}
                        onReroute={rerouteReferral}
                    />
                )}
                {activeTab === 'map' && <MapView facilities={facilities} />}
                {activeTab === 'district' && (
                    <DistrictView facilities={facilities} referrals={referrals} patients={patients} onReroute={rerouteReferral} />
                )}
            </main>

            <footer style={{ borderTop: `1px solid ${COLORS.rule}`, padding: '16px 28px', textAlign: 'center' }}>
                <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: COLORS.inkSoft }}>
                    Live multi-user build · shared database · real-time sync · mothers reachable by USSD
                </span>
            </footer>
        </div>
    );
}

export default App;
