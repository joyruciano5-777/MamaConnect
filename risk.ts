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

export interface RiskResult {
    level: 'low' | 'moderate' | 'high' | 'emergency';
    label: string;
    tone: 'green' | 'amber' | 'rust';
    flaggedForReview?: boolean;
}

export function computeRisk(v: Vitals): RiskResult {
    const redFlags = [v.bleeding, v.convulsions, v.systolic >= 160 || v.diastolic >= 110].filter(Boolean).length;
    const moderateFlags = [
        v.systolic >= 140 || v.diastolic >= 90,
        v.severeHeadache,
        v.fever,
        v.reducedFetalMovement,
        v.prolongedLabor,
    ].filter(Boolean).length;
    const hasUnclassified = Boolean(v.otherSymptom && v.otherSymptom.trim().length > 0);

    let result: RiskResult;
    if (redFlags > 0) {
        result = { level: 'emergency', label: 'REFER NOW — EMERGENCY', tone: 'rust' };
    } else if (moderateFlags >= 2) {
        result = { level: 'high', label: 'REFER NOW', tone: 'rust' };
    } else if (moderateFlags === 1) {
        result = { level: 'moderate', label: 'MONITOR — recheck in 48h', tone: 'amber' };
    } else {
        result = { level: 'low', label: 'ROUTINE — continue ANC schedule', tone: 'green' };
    }

    if (hasUnclassified && result.level === 'low') {
        return { level: 'moderate', label: 'MONITOR — unclassified symptom, recheck in 48h', tone: 'amber', flaggedForReview: true };
    }
    return { ...result, flaggedForReview: hasUnclassified };
}

export const COMMODITIES = [
    { key: 'oxytocin', label: 'Oxytocin', unit: 'amp', critical: 5, low: 15 },
    { key: 'magnesium', label: 'Magnesium sulfate', unit: 'vial', critical: 4, low: 12 },
    { key: 'misoprostol', label: 'Misoprostol', unit: 'tab', critical: 10, low: 30 },
    { key: 'blood', label: 'Blood, O-neg', unit: 'unit', critical: 2, low: 6 },
    { key: 'antibiotics', label: 'Injectable antibiotics', unit: 'vial', critical: 8, low: 20 },
];

export function requiredCommodities(v: Vitals): string[] {
    const keys = new Set<string>();
    if (v.bleeding) { keys.add('oxytocin'); keys.add('blood'); keys.add('misoprostol'); }
    if (v.convulsions) keys.add('magnesium');
    if (v.systolic >= 160 || v.diastolic >= 110) keys.add('magnesium');
    if (v.fever) keys.add('antibiotics');
    if (keys.size === 0) keys.add('oxytocin');
    return Array.from(keys);
}

export function stockStatus(commodityKey: string, qty: number): 'critical' | 'low' | 'ok' {
    const spec = COMMODITIES.find((c) => c.key === commodityKey);
    if (!spec) return 'ok';
    if (qty <= spec.critical) return 'critical';
    if (qty <= spec.low) return 'low';
    return 'ok';
}

export function facilityReadiness(stock: Record<string, number>, requiredKeys: string[]) {
    const missing = requiredKeys.filter((k) => stockStatus(k, stock?.[k] ?? 0) === 'critical');
    return { ready: missing.length === 0, missing };
}

export const ACK_SLA_MIN = 10;
