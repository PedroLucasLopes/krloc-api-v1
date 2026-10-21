import { DocumentKind } from 'generated/prisma/client';

export const BILLING_RULES = [
  'usage',
  'renewal',
  'excess',
  'indemnity',
  'release',
] as const;

export type BillingRule = (typeof BILLING_RULES)[number];

export const REQUIRED_BILLING_RULES: BillingRule[] = [
  'usage',
  'renewal',
  'excess',
  'indemnity',
];

export interface DocumentIssuer {
  name: string;
  taxId: string;
  address: string;
  phone: string;
  city: string;
}

export interface RenterLabels {
  name: string;
  taxId: string;
  phone: string;
  address: string;
  zipcode: string;
  billingAddress: string;
  site: string;
  siteZipcode: string;
}

export interface ItemColumns {
  quantity: string;
  product: string;
  model: string;
  indemnity: string;
  elease: string;
}

export interface PriceColumns {
  product: string;
  daily: string;
  weekly: string;
  biweekly: string;
  monthly: string;
}

export type ContractBlock =
  | { kind: 'title'; text: string }
  | { kind: 'section'; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'clause'; text: string; billingRule?: BillingRule }
  | { kind: 'renter'; labels: RenterLabels }
  | { kind: 'items'; columns: ItemColumns }
  | { kind: 'prices'; columns: PriceColumns }
  | { kind: 'signatures'; left: string; right: string };

export interface ContractContent {
  blocks: ContractBlock[];
}

export interface ReportContent {
  billingNote: string;
  signatures: { left: string; right: string };
}

export interface DocumentTemplateView<Content> {
  id: string;
  kind: DocumentKind;
  version: number;
  issuer: DocumentIssuer;
  content: Content;
  logo: string | null;
  createdAt: Date;
}

export type ContractTemplate = DocumentTemplateView<ContractContent>;
export type ReportTemplate = DocumentTemplateView<ReportContent>;

const TEXT_BLOCKS = new Set(['title', 'section', 'paragraph', 'clause']);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasStrings = (value: unknown, keys: string[]): boolean =>
  isRecord(value) && keys.every((key) => typeof value[key] === 'string');

export function issuerProblem(issuer: unknown): string | null {
  const keys = ['name', 'taxId', 'address', 'phone', 'city'];

  return hasStrings(issuer, keys) ? null : `issuer: falta ${keys.join(', ')}`;
}

function blockProblem(block: unknown, index: number): string | null {
  if (!isRecord(block) || typeof block.kind !== 'string') {
    return `blocks[${index}]: sem kind`;
  }

  const where = `blocks[${index}] (${block.kind})`;

  if (TEXT_BLOCKS.has(block.kind)) {
    if (typeof block.text !== 'string' || block.text.trim() === '') {
      return `${where}: text vazio`;
    }

    if (
      block.kind === 'clause' &&
      block.billingRule !== undefined &&
      !BILLING_RULES.includes(block.billingRule as BillingRule)
    ) {
      return `${where}: billingRule desconhecido`;
    }

    return null;
  }

  if (block.kind === 'renter') {
    const keys: (keyof RenterLabels)[] = [
      'name',
      'taxId',
      'phone',
      'address',
      'zipcode',
      'billingAddress',
      'site',
      'siteZipcode',
    ];

    return hasStrings(block.labels, keys)
      ? null
      : `${where}: labels incompletos`;
  }

  if (block.kind === 'items') {
    const keys: (keyof ItemColumns)[] = [
      'quantity',
      'product',
      'model',
      'indemnity',
      'elease',
    ];

    return hasStrings(block.columns, keys)
      ? null
      : `${where}: columns incompletos`;
  }

  if (block.kind === 'prices') {
    const keys: (keyof PriceColumns)[] = [
      'product',
      'daily',
      'weekly',
      'biweekly',
      'monthly',
    ];

    return hasStrings(block.columns, keys)
      ? null
      : `${where}: columns incompletos`;
  }

  if (block.kind === 'signatures') {
    return hasStrings(block, ['left', 'right'])
      ? null
      : `${where}: left e right`;
  }

  return `${where}: kind desconhecido`;
}

export function contractProblem(
  issuer: unknown,
  content: unknown,
): string | null {
  const noIssuer = issuerProblem(issuer);

  if (noIssuer) return noIssuer;

  if (!isRecord(content) || !Array.isArray(content.blocks)) {
    return 'content.blocks: lista ausente';
  }

  for (const [index, block] of content.blocks.entries()) {
    const problem = blockProblem(block, index);

    if (problem) return problem;
  }

  const rules = new Set(
    content.blocks
      .filter(
        (block): block is ContractBlock & { billingRule: BillingRule } =>
          isRecord(block) && typeof block.billingRule === 'string',
      )
      .map((block) => block.billingRule),
  );
  const missing = REQUIRED_BILLING_RULES.filter((rule) => !rules.has(rule));

  return missing.length === 0
    ? null
    : `clausulas do motor de cobranca ausentes: ${missing.join(', ')}`;
}

export function reportProblem(
  issuer: unknown,
  content: unknown,
): string | null {
  const noIssuer = issuerProblem(issuer);

  if (noIssuer) return noIssuer;

  if (!isRecord(content) || typeof content.billingNote !== 'string') {
    return 'content.billingNote: texto ausente';
  }

  return hasStrings(content.signatures, ['left', 'right'])
    ? null
    : 'content.signatures: left e right';
}
