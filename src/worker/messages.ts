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
})

export const workerRequestSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('init'),
    requestId: z.string(),
  }),
  z.object({
    type: z.literal('execute_pipeline'),
    requestId: z.string(),
    spectrumId: z.string(),
    abscissa: z.array(z.number()),
    ordinate: z.array(z.number()),
    pipelineCode: z.string(),
    preferFloat32: z.boolean(),
  }),
  z.object({
    type: z.literal('execute_script'),
    requestId: z.string(),
    spectrumId: z.string(),
    abscissa: z.array(z.number()),
    ordinate: z.array(z.number()),
    metadata: workerMetadataSchema,
    scriptCode: z.string(),
    preferFloat32: z.boolean(),
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
    metadata: workerMetadataSchema.partial().optional(),
    precision: z.enum(['float32', 'float64']),
  }),
  z.object({
    type: z.literal('cancelled'),
    requestId: z.string(),
  }),
  z.object({
    type: z.literal('error'),
    requestId: z.string(),
    message: z.string(),
  }),
])

export type WorkerResponse = z.infer<typeof workerResponseSchema>
