import type {QualityReport} from '../types/colorEngine';

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

interface BuildQualityReportInput {
  deltaE?: number;
  previewExportDelta?: number;
  bandingScore?: number;
  highlightsClipRatio?: number;
  shadowsClipRatio?: number;
  outOfGamutRatio?: number;
}

export const buildQualityReport = (input: BuildQualityReportInput): QualityReport => ({
  deltaE: Number(input.deltaE || 0),
  previewExportDelta: Number(input.previewExportDelta || 0),
  bandingScore: Number(input.bandingScore || 0),
  clipStats: {
    highlights: clamp01(Number(input.highlightsClipRatio || 0)),
    shadows: clamp01(Number(input.shadowsClipRatio || 0)),
    outOfGamut: clamp01(Number(input.outOfGamutRatio || 0)),
  },
});

