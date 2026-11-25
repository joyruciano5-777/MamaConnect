import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';

export const COLORS = {
  paper: '#F6F3EC',
  paperDark: '#EDE8DB',
  ink: '#1C2A38',
  inkSoft: '#4A5A68',
  rule: '#D8D0BE',
  rust: '#B8412A',
  rustSoft: '#F1DED7',
  amber: '#C58A2E',
  amberSoft: '#F3E6CC',
  green: '#4C7A56',
  greenSoft: '#DCE7DD',
};

export const FONT_IMPORT = `
@import url('https://fonts.googleapis.com/css2?family=Roboto+Slab:wght@400;600;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');
`;

export const REGIONS = ['Meru County', 'Kisumu County'];

export interface Vitals {
  systolic: number;
  diastolic: number;
  bleeding: boolean;
  convulsions: boolean;
  severeHeadache: boolean;
  fever: boolean;
  reducedFetalMovement: boolean;
  prolongedLabor: boolean;
  otherSymptom?: string;
}

export function computeRisk(v: Vitals) {
  const redFlags = [
    v.bleeding,
    v.convulsions,
    v.systolic >= 160 || v.diastolic >= 110,
  ].filter(Boolean).length;
  const moderateFlags = [
    v.systolic >= 140 || v.diastolic >= 90,
    v.severeHeadache,
    v.fever,
    v.reducedFetalMovement,
    v.prolongedLabor,
  ].filter(Boolean).length;
  const hasUnclassified = Boolean(
    v.otherSymptom && v.otherSymptom.trim().length > 0
  );

  let result: {
    level: 'low' | 'moderate' | 'high' | 'emergency';
    label: string;
    tone: 'green' | 'amber' | 'rust';
  };
  if (redFlags > 0)
    result = {
      level: 'emergency',
      label: 'REFER NOW — EMERGENCY',
      tone: 'rust',
    };
  else if (moderateFlags >= 2)
    result = { level: 'high', label: 'REFER NOW', tone: 'rust' };
  else if (moderateFlags === 1)
    result = {
      level: 'moderate',
      label: 'MONITOR — recheck in 48h',
      tone: 'amber',
    };
  else
    result = {
      level: 'low',
      label: 'ROUTINE — continue ANC schedule',
      tone: 'green',
    };

  if (hasUnclassified && result.level === 'low') {
    return {
      level: 'moderate' as const,
      label: 'MONITOR — unclassified symptom, recheck in 48h',
      tone: 'amber' as const,
      flaggedForReview: true,
    };
  }
  return { ...result, flaggedForReview: hasUnclassified };
}

export const COMMODITIES = [
  { key: 'oxytocin', label: 'Oxytocin', unit: 'amp', critical: 5, low: 15 },
  {
    key: 'magnesium',
    label: 'Magnesium sulfate',
    unit: 'vial',
    critical: 4,
    low: 12,
  },
  {
    key: 'misoprostol',
    label: 'Misoprostol',
    unit: 'tab',
    critical: 10,
    low: 30,
  },
  { key: 'blood', label: 'Blood, O-neg', unit: 'unit', critical: 2, low: 6 },
  {
    key: 'antibiotics',
    label: 'Injectable antibiotics',
    unit: 'vial',
    critical: 8,
    low: 20,
  },
];

export function requiredCommodities(v: Vitals): string[] {
  const keys = new Set<string>();
  if (v.bleeding) {
    keys.add('oxytocin');
    keys.add('blood');
    keys.add('misoprostol');
  }
  if (v.convulsions) keys.add('magnesium');
  if (v.systolic >= 160 || v.diastolic >= 110) keys.add('magnesium');
  if (v.fever) keys.add('antibiotics');
  if (keys.size === 0) keys.add('oxytocin');
  return Array.from(keys);
}

export function stockStatus(
  commodityKey: string,
  qty: number
): 'critical' | 'low' | 'ok' {
  const spec = COMMODITIES.find(c => c.key === commodityKey);
  if (!spec) return 'ok';
  if (qty <= spec.critical) return 'critical';
  if (qty <= spec.low) return 'low';
  return 'ok';
}

export function facilityReadiness(
  stock: Record<string, number>,
  requiredKeys: string[]
) {
  const missing = requiredKeys.filter(
    k => stockStatus(k, stock?.[k] ?? 0) === 'critical'
  );
  return { ready: missing.length === 0, missing };
}

export const ACK_SLA_MIN = 10;

export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function distKmFrom(
  origin: { lat: number; lng: number } | undefined,
  facility: { lat: number; lng: number }
) {
  if (!origin || facility.lat == null) return null;
  return (
    Math.round(
      haversineKm(origin.lat, origin.lng, facility.lat, facility.lng) * 10
    ) / 10
  );
}

export function referralStatusInfo(ref: any) {
  const sinceThisFacilityMin =
    (Date.now() - (ref.assignedAt || ref.createdAt)) / 60000;
  if (ref.status === 'arrived')
    return { label: 'Arrived at facility', tone: 'green' as const };
  if (ref.status === 'acknowledged')
    return { label: 'Facility notified, preparing', tone: 'green' as const };
  if (sinceThisFacilityMin > ACK_SLA_MIN)
    return {
      label: 'Not acknowledged — escalating to district',
      tone: 'rust' as const,
    };
  return { label: 'Awaiting facility acknowledgment', tone: 'amber' as const };
}

export function Tone({ tone, children, style }: any) {
  const map: Record<string, { bg: string; fg: string }> = {
    rust: { bg: COLORS.rustSoft, fg: COLORS.rust },
    amber: { bg: COLORS.amberSoft, fg: '#8A611D' },
    green: { bg: COLORS.greenSoft, fg: COLORS.green },
    ink: { bg: COLORS.paperDark, fg: COLORS.inkSoft },
  };
  const c = map[tone] || map.ink;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '3px 10px',
        borderRadius: 3,
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: 11,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        fontWeight: 500,
        background: c.bg,
        color: c.fg,
        ...style,
      }}
    >
      {children}
    </span>
  );
}

export function ElapsedClock({ since, sla, frozenAt }: any) {
  const [, force] = useState(0);
  useEffect(() => {
    if (frozenAt) return;
    const t = setInterval(() => force(n => n + 1), 15000);
    return () => clearInterval(t);
  }, [frozenAt]);
  const endpoint = frozenAt || Date.now();
  const elapsedMin = Math.floor((endpoint - since) / 60000);
  const breached = !frozenAt && sla && elapsedMin > sla;
  const h = Math.floor(elapsedMin / 60);
  const m = elapsedMin % 60;
  const text = h > 0 ? `${h}h ${m}m` : `${m}m`;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: 12,
        fontWeight: 500,
        color: breached ? COLORS.rust : COLORS.inkSoft,
      }}
    >
      <Clock size={12} strokeWidth={2.2} />
      {text}
      {frozenAt ? ' (arrived)' : ' elapsed'}
      {breached ? ' · SLA breached' : ''}
    </span>
  );
}

export function Card({ children, style }: any) {
  return (
    <div
      style={{
        background: '#FFFEFB',
        border: `1px solid ${COLORS.rule}`,
        borderRadius: 4,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function SectionLabel({ eyebrow, title, subtitle }: any) {
  return (
    <div style={{ marginBottom: 18 }}>
      {eyebrow && (
        <div
          style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 11,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: COLORS.rust,
            marginBottom: 6,
            fontWeight: 500,
          }}
        >
          {eyebrow}
        </div>
      )}
      <h2
        style={{
          fontFamily: "'Roboto Slab', serif",
          fontSize: 22,
          fontWeight: 700,
          color: COLORS.ink,
          margin: 0,
        }}
      >
        {title}
      </h2>
      {subtitle && (
        <p
          style={{
            color: COLORS.inkSoft,
            fontSize: 13.5,
            marginTop: 6,
            maxWidth: 560,
            lineHeight: 1.5,
          }}
        >
          {subtitle}
        </p>
      )}
    </div>
  );
}

export function StatCard({ label, value, tone, icon: Icon }: any) {
  const toneColor =
    tone === 'rust'
      ? COLORS.rust
      : tone === 'green'
        ? COLORS.green
        : COLORS.ink;
  return (
    <Card style={{ padding: 16 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
        }}
      >
        <div
          style={{
            fontSize: 11.5,
            color: COLORS.inkSoft,
            maxWidth: 120,
            lineHeight: 1.4,
          }}
        >
          {label}
        </div>
        <Icon size={16} color={toneColor} strokeWidth={2} />
      </div>
      <div
        style={{
          fontFamily: "'Roboto Slab', serif",
          fontSize: 30,
          fontWeight: 700,
          color: toneColor,
          marginTop: 8,
        }}
      >
        {value}
      </div>
    </Card>
  );
}

export const inputStyle = {
  padding: '9px 10px',
  border: `1px solid ${COLORS.rule}`,
  borderRadius: 3,
  fontFamily: "'IBM Plex Sans', sans-serif",
  fontSize: 13,
  background: '#FFFEFB',
  color: COLORS.ink,
};

export const primaryBtn = {
  background: COLORS.rust,
  color: '#FFF6F2',
  border: 'none',
  padding: '10px 16px',
  borderRadius: 3,
  fontFamily: "'IBM Plex Sans', sans-serif",
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
};

export const ghostBtn = {
  background: 'transparent',
  border: `1px solid ${COLORS.rule}`,
  color: COLORS.ink,
  padding: '7px 12px',
  borderRadius: 3,
  fontFamily: "'IBM Plex Sans', sans-serif",
  fontSize: 12,
  cursor: 'pointer',
};

export const qtyBtn = {
  width: 26,
  height: 26,
  border: `1px solid ${COLORS.rule}`,
  background: '#FFFEFB',
  borderRadius: 3,
  cursor: 'pointer',
  fontSize: 14,
  color: COLORS.ink,
  lineHeight: 1,
};

export const rowHeader = {
  padding: '12px 18px',
  borderBottom: `1px solid ${COLORS.rule}`,
  fontFamily: "'IBM Plex Mono', monospace",
  fontSize: 11,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.08em',
  color: COLORS.inkSoft,
};
