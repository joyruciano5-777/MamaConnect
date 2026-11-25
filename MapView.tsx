import { useMemo, useState } from 'react';
import { MapPin, Navigation } from 'lucide-react';
import {
  COLORS,
  Card,
  SectionLabel,
  Tone,
  ghostBtn,
  rowHeader,
  distKmFrom,
  stockStatus,
  COMMODITIES,
  REGIONS,
} from '../lib/shared';

function regionCenters(facilities: any[]) {
  const centers: Record<string, { lat: number; lng: number }> = {};
  REGIONS.forEach(region => {
    const inRegion = facilities.filter(f => f.region === region);
    if (inRegion.length === 0) return;
    centers[region] = {
      lat: inRegion.reduce((s, f) => s + f.lat, 0) / inRegion.length,
      lng: inRegion.reduce((s, f) => s + f.lng, 0) / inRegion.length,
    };
  });
  return centers;
}

function overallTier(facility: any) {
  const statuses = COMMODITIES.map(c =>
    stockStatus(c.key, facility.stock[c.key] ?? 0)
  );
  if (statuses.includes('critical')) return 'critical';
  if (statuses.includes('low')) return 'low';
  return 'ready';
}

export default function MapView({ facilities }: any) {
  const centers = useMemo(() => regionCenters(facilities), [facilities]);
  const [origin, setOrigin] = useState<any>(() => ({
    ...(centers[REGIONS[0]] || { lat: 0, lng: 0 }),
    label: `Approximate — ${REGIONS[0]} center`,
  }));
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);

  if (facilities.length === 0) {
    return (
      <div style={{ padding: 20, color: COLORS.inkSoft, fontSize: 13 }}>
        Loading facilities…
      </div>
    );
  }

  function useMyLocation() {
    if (!navigator.geolocation) {
      setLocError("Geolocation isn't available in this browser.");
      return;
    }
    setLocating(true);
    setLocError(null);
    navigator.geolocation.getCurrentPosition(
      pos => {
        setOrigin({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          label: 'Your device location',
        });
        setLocating(false);
      },
      () => {
        setLocError(
          'Location permission denied — showing the regional estimate instead.'
        );
        setLocating(false);
      },
      { timeout: 8000 }
    );
  }

  const ranked = useMemo(() => {
    return facilities
      .map((f: any) => ({
        ...f,
        tier: overallTier(f),
        distKm: distKmFrom(origin, f),
      }))
      .sort((a: any, b: any) => (a.distKm ?? 0) - (b.distKm ?? 0));
  }, [facilities, origin]);

  const nearestReady = ranked.find((f: any) => f.tier === 'ready');

  const allPoints = [
    ...ranked.map((f: any) => ({ lat: f.lat, lng: f.lng })),
    { lat: origin.lat, lng: origin.lng },
  ];
  const lats = allPoints.map(p => p.lat);
  const lngs = allPoints.map(p => p.lng);
  const latPad = (Math.max(...lats) - Math.min(...lats)) * 0.25 || 0.05;
  const lngPad = (Math.max(...lngs) - Math.min(...lngs)) * 0.25 || 0.05;
  const minLat = Math.min(...lats) - latPad,
    maxLat = Math.max(...lats) + latPad;
  const minLng = Math.min(...lngs) - lngPad,
    maxLng = Math.max(...lngs) + lngPad;
  const W = 700,
    H = 380;
  const project = (lat: number, lng: number) => ({
    x: ((lng - minLng) / (maxLng - minLng)) * W,
    y: H - ((lat - minLat) / (maxLat - minLat)) * H,
  });
  const tierColor: Record<string, string> = {
    ready: COLORS.green,
    low: COLORS.amber,
    critical: COLORS.rust,
  };

  return (
    <div>
      <SectionLabel
        eyebrow="Facility map"
        title="Nearest ready facility"
        subtitle="A referral to the closest facility is worthless if it can't treat her. Positions come from each facility's real coordinates, colored by commodity readiness."
      />

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 10,
          marginBottom: 14,
        }}
      >
        <div style={{ fontSize: 12, color: COLORS.inkSoft }}>
          Origin: {origin.label}
          {locError && (
            <span style={{ color: COLORS.rust }}> · {locError}</span>
          )}
        </div>
        <button
          onClick={useMyLocation}
          disabled={locating}
          style={{
            ...ghostBtn,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <Navigation size={12} /> {locating ? 'Locating…' : 'Use my location'}
        </button>
      </div>

      {nearestReady ? (
        <Card
          style={{
            padding: '14px 18px',
            marginBottom: 16,
            background: COLORS.greenSoft,
            border: 'none',
          }}
        >
          <span style={{ fontSize: 13, color: COLORS.ink }}>
            <MapPin size={13} style={{ verticalAlign: -2, marginRight: 6 }} />
            Nearest stock-ready facility: <strong>
              {nearestReady.name}
            </strong> · {nearestReady.distKm} km
          </span>
        </Card>
      ) : (
        <Card
          style={{
            padding: '14px 18px',
            marginBottom: 16,
            background: COLORS.rustSoft,
            border: 'none',
          }}
        >
          <span style={{ fontSize: 13, color: COLORS.rust }}>
            No fully stock-ready facility nearby — every option has at least one
            critical shortage.
          </span>
        </Card>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1.4fr 1fr',
          gap: 20,
          alignItems: 'start',
        }}
        className="responsive-grid"
      >
        <Card style={{ padding: 12 }}>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            style={{ width: '100%', height: 'auto', display: 'block' }}
          >
            <rect
              x={0}
              y={0}
              width={W}
              height={H}
              fill={COLORS.paperDark}
              rx={4}
            />
            {(() => {
              const o = project(origin.lat, origin.lng);
              return (
                <g>
                  <circle
                    cx={o.x}
                    cy={o.y}
                    r={7}
                    fill={COLORS.ink}
                    stroke="#FFFEFB"
                    strokeWidth={2}
                  />
                  <text
                    x={o.x + 10}
                    y={o.y + 4}
                    fontSize={11}
                    fontFamily="'IBM Plex Mono', monospace"
                    fill={COLORS.ink}
                  >
                    you
                  </text>
                </g>
              );
            })()}
            {ranked.map((f: any) => {
              const pt = project(f.lat, f.lng);
              return (
                <g key={f.id}>
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r={6}
                    fill={tierColor[f.tier]}
                    stroke="#FFFEFB"
                    strokeWidth={1.5}
                  />
                  <text
                    x={pt.x + 9}
                    y={pt.y + 4}
                    fontSize={11}
                    fontFamily="'IBM Plex Sans', sans-serif"
                    fill={COLORS.ink}
                  >
                    {f.name}
                  </text>
                </g>
              );
            })}
          </svg>
          <div
            style={{
              fontSize: 10.5,
              color: COLORS.inkSoft,
              marginTop: 8,
              fontFamily: "'IBM Plex Mono', monospace",
            }}
          >
            Schematic positions from real coordinates — not a routable road map.
          </div>
        </Card>

        <Card>
          <div style={rowHeader}>Facilities by distance</div>
          {ranked.map((f: any, i: number) => (
            <div
              key={f.id}
              style={{
                padding: '12px 18px',
                borderTop: i === 0 ? 'none' : `1px solid ${COLORS.rule}`,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <div>
                <div
                  style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}
                >
                  {f.name}
                </div>
                <div style={{ fontSize: 11.5, color: COLORS.inkSoft }}>
                  {f.level} · {f.region} · {f.distKm} km
                </div>
              </div>
              <Tone
                tone={
                  f.tier === 'ready'
                    ? 'green'
                    : f.tier === 'low'
                      ? 'amber'
                      : 'rust'
                }
              >
                {f.tier === 'ready'
                  ? 'Ready'
                  : f.tier === 'low'
                    ? 'Low stock'
                    : 'Critical'}
              </Tone>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}
