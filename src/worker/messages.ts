import { z } from 'zod'

const pipelineSchema = z.array(
  z.object({
    id: z.string(),
    type: z.string(),
    scope: z.string(),
    enabled: z.boolean(),
    params: z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])),
  }),
)

const runnerMetadataSchema = z.object({
  spectrumType: z.string(),
  units: z.object({ x: z.string(), y: z.string() }),
  pipeline: pipelineSchema,
  peakDetection: z.object({
    prominence: z.number(),
    minDistance: z.number(),
    minHeight: z.number().nullable(),
    mode: z.enum(['maxima', 'minima']),
  }),
})

/** Processed ordinates use NaN for points a crop step removed. */
const signalSchema = z.array(z.union([z.number(), z.nan()]))

const assignedPeakSchema = z.object({
  index: z.number(), x: z.number(), y: z.number(), prominence: z.number(),
  label: z.string(), intensity: z.enum(['weak', 'medium', 'strong']),
  confidence: z.enum(['high', 'medium', 'low']),
  alternatives: z.array(z.string()),
})

export const workerRequestSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('init'),
    requestId: z.string(),
  }),
  z.object({
    type: z.literal('execute_batch'),
    requestId: z.string(),
    runScript: z.string(),
    scriptFiles: z.record(z.string(), z.string()),
    samples: z.array(z.object({
      id: z.string(),
      abscissa: z.array(z.number()),
      ordinate: z.array(z.number()),
      metadata: runnerMetadataSchema,
    })),
    preferFloat32: z.boolean(),
  }),
  z.object({
    type: z.literal('detect_peaks'),
    requestId: z.string(),
    spectrumId: z.string(),
    abscissa: z.array(z.number()),
    ordinate: signalSchema,
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
    ordinate: signalSchema,
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
    type: z.literal('batch_result'),
    requestId: z.string(),
    results: z.array(z.union([
      z.object({
        id: z.string(),
        ordinateModified: signalSchema,
        peaks: z.array(assignedPeakSchema),
        precision: z.enum(['float32', 'float64']),
      }),
      z.object({ id: z.string(), error: z.string() }),
    ])),
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
export type BatchRequest = Extract<WorkerRequest, { type: 'execute_batch' }>
export type BatchSampleResult = Extract<WorkerResponse, { type: 'batch_result' }>['results'][number]
