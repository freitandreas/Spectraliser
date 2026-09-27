import { z } from 'zod'

const workerMetadataSchema = z.object({
  name: z.string(),
  sourcePath: z.string(),
  spectrumType: z.string(),
  pipeline: z.array(
    z.object({
      id: z.string(),
      type: z.string(),
      scope: z.string(),
      enabled: z.boolean(),
      params: z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])),
    }),
  ).optional(),
  units: z.object({
    x: z.string(),
    y: z.string(),
  }),
  style: z.object({
    label: z.string(),
    lineColor: z.string(),
    lineWidth: z.number(),
    scatterSymbol: z.string(),
    visible: z.boolean().optional(),
  }),
  peakDetectionMode: z.enum(['maxima', 'minima']).optional(),
  peakDetection: z.object({
    prominence: z.number(),
    minDistance: z.number(),
    minHeight: z.number().nullable(),
    mode: z.enum(['maxima', 'minima']),
  }).optional(),
})

export const workerRequestSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('init'),
    requestId: z.string(),
  }),
  z.object({
    type: z.literal('execute_script'),
    requestId: z.string(),
    spectrumId: z.string(),
    abscissa: z.array(z.number()),
    ordinate: z.array(z.number()),
    metadata: workerMetadataSchema,
    scriptCode: z.string(),
    scriptFiles: z.record(z.string(), z.string()).optional(),
    preferFloat32: z.boolean(),
  }),
  z.object({
    type: z.literal('detect_peaks'),
    requestId: z.string(),
    spectrumId: z.string(),
    abscissa: z.array(z.number()),
    ordinate: z.array(z.number()),
    prominence: z.number(),
    minDistance: z.number(),
    minHeight: z.number().nullable(),
    mode: z.enum(['maxima', 'minima']),
  }),
  z.object({
    type: z.literal('peak_heatmap'),
    requestId: z.string(),
    spectrumId: z.string(),
    abscissa: z.array(z.number()),
    ordinate: z.array(z.number()),
    prominenceValues: z.array(z.number()),
    distanceValues: z.array(z.number()),
    minHeight: z.number().nullable(),
    mode: z.enum(['maxima', 'minima']),
  }),
  z.object({
    type: z.literal('cancel'),
    requestId: z.string(),
    targetRequestId: z.string(),
  }),
])

export type WorkerRequest = z.infer<typeof workerRequestSchema>

export const workerResponseSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('ready'),
    requestId: z.string(),
    pyodideVersion: z.string(),
  }),
  z.object({
    type: z.literal('result'),
    requestId: z.string(),
    spectrumId: z.string(),
    abscissa: z.array(z.number()).optional(),
    ordinateOriginal: z.array(z.number()).optional(),
    ordinateModified: z.array(z.number()),
    peaks: z.array(z.object({
      index: z.number(), x: z.number(), y: z.number(), prominence: z.number(),
      label: z.string(), intensity: z.enum(['weak', 'medium', 'strong']),
      confidence: z.enum(['high', 'medium', 'low']),
      alternatives: z.array(z.string()),
    })).optional(),
    metadata: workerMetadataSchema.partial().optional(),
    precision: z.enum(['float32', 'float64']),
  }),
  z.object({
    type: z.literal('cancelled'),
    requestId: z.string(),
  }),
  z.object({
    type: z.literal('peaks_result'),
    requestId: z.string(),
    spectrumId: z.string(),
    peaks: z.array(
      z.object({
        index: z.number(),
        x: z.number(),
        y: z.number(),
        prominence: z.number(),
      }),
    ),
  }),
  z.object({
    type: z.literal('peaks_heatmap_result'),
    requestId: z.string(),
    spectrumId: z.string(),
    prominenceValues: z.array(z.number()),
    distanceValues: z.array(z.number()),
    counts: z.array(z.array(z.number())),
  }),
  z.object({
    type: z.literal('error'),
    requestId: z.string(),
    message: z.string(),
  }),
])

export type WorkerResponse = z.infer<typeof workerResponseSchema>
