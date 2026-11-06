// The deposit restitution of a lease (RENT-INV-001 §6, slice 9; tenure-api
// Q-115; Q-W30): the wear grid annexed to the lease, deductions on the exit
// items worse or missing and the missing keys, each backed by a quote or an
// invoice, and the RD statements (the first, then the release of a holdback).
// Pure helpers are exported for the tests.
import { api } from '@/api/client'
import type { Schemas } from '@/api/types'

export type Deposit = Schemas['inventory.DepositView']
export type Grid = Schemas['inventory.GridView']
export type GridInput = Schemas['inventory.GridInput']
export type GridLine = Schemas['inventory.GridLine']
export type Deduction = Schemas['inventory.DeductionView']
export type DeductionCreate = Schemas['inventory.DeductionCreate']
export type Statement = Schemas['inventory.Statement']
export type SettleInput = Schemas['inventory.SettleInput']

export async function getDeposit(lease: string): Promise<Deposit> {
  return (await api.get<Deposit>(`/leases/${lease}/deposit`)).data
}
export async function getGrids(): Promise<Grid[]> {
  return (await api.get<Grid[]>('/vetuste-grids')).data
}
export async function createGrid(input: GridInput): Promise<Grid> {
  return (await api.post<Grid>('/vetuste-grids', input)).data
}
export async function attachGrid(lease: string, grid: string | null): Promise<Deposit> {
  return (await api.put<Deposit>(`/leases/${lease}/vetuste-grid`, { vetuste_grid_id: grid })).data
}
export async function addDeduction(lease: string, input: DeductionCreate): Promise<Deduction> {
  return (await api.post<Deduction>(`/leases/${lease}/deposit-deductions`, input)).data
}
export async function removeDeduction(id: string): Promise<void> {
  await api.del(`/deposit-deductions/${id}`)
}
export async function settle(lease: string, input: SettleInput): Promise<Statement> {
  return (await api.post<Statement>(`/leases/${lease}/deposit-settlement`, input)).data
}

// sharePct prints a share in basis points as a French percentage, by
// integer arithmetic (no float near a share).
export function sharePct(bp: number | undefined): string {
  const v = Math.max(0, Math.trunc(bp ?? 0))
  const rest = v % 100
  return rest ? `${(v - rest) / 100},${String(rest).padStart(2, '0')} %` : `${(v - rest) / 100} %`
}

// retained tells whether an exit item already carries a deduction.
export function retained(d: Pick<Deposit, 'deductions'>, exitItem: string | undefined): boolean {
  return (d.deductions ?? []).some((x) => x.exit_item_id === exitItem)
}

// needsApproval says the next statement waits on the building's accounts:
// a release, or a first one in a collective building (a holdback otherwise).
export function needsApproval(d: Pick<Deposit, 'next' | 'collective_building'>): boolean {
  return d.next === 'release' || (d.next === 'initial' && !!d.collective_building)
}
