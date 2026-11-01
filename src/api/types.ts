// Shorthands over the generated schema (schema.d.ts).
import type { components } from './schema'

export type Schemas = components['schemas']
export type Me = Schemas['portfolio.MeView']
export type Owner = Schemas['portfolio.OwnerView']
export type OwnerInput = Schemas['portfolio.OwnerInput']
export type Scope = Schemas['auth.Scope']
export type JobRun = Schemas['jobs.Run']
export type Problem = Schemas['problem.Body']
export interface Page<T> {
  items: T[]
  total: number
  page: number
  size: number
}
