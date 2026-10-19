import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import type { LeaseItem } from 'generated/prisma/client';
import type { ELeaseById } from 'src/routes/elease/types/eLeaseById';
import type { StatementDto } from 'src/routes/finantial/billing/statement';
import { date, money, moneyOrDash } from '../helper/report.helper';
import {
  ContractBlock,
  ContractTemplate,
  DocumentIssuer,
} from '../types/documentTemplate';
import {
  documentOf,
  labelValue,
  paragraph,
  section,
  signatures,
  table,
  title,
} from './pdf';

const today = (): string => date(new Date());

function fill(text: string, values: Record<string, string>): string {
  return text.replaceAll(/\{(\w+)\}/g, (whole, key: string) =>
    key in values ? values[key] : whole,
  );
}

function renterBlock(contract: ELeaseById, block: ContractBlock): Content[] {
  if (block.kind !== 'renter') return [];

  const { labels } = block;
  const { lessee } = contract;
  const { client } = lessee;
  const address = [client.address, client.neighborhood, client.city]
    .filter(Boolean)
    .join(', ');

  return [
    labelValue(labels.name, client.name),
    labelValue(labels.taxId, client.tax_id),
    labelValue(labels.phone, client.phone ?? '—'),
    labelValue(labels.address, `${address}/${client.state ?? ''}`),
    labelValue(labels.zipcode, client.zipcode),
    labelValue(
      labels.billingAddress,
      `${lessee.address}, ${lessee.neighborhood ?? ''}, ${lessee.city}/${lessee.state ?? ''}`,
    ),
    labelValue(labels.site, lessee.name),
    labelValue(labels.siteZipcode, lessee.zipcode),
  ];
}

function itemsBlock(
  items: LeaseItem[],
  contractedByItem: Map<string, number>,
  block: ContractBlock,
): Content[] {
  if (block.kind !== 'items') return [];

  const { columns } = block;

  return [
    table(
      [
        columns.quantity,
        columns.product,
        columns.model,
        columns.indemnity,
        columns.elease,
      ],
      items.map((item) => [
        '1',
        item.equipmentName,
        `${item.equipmentCode}-${item.equipmentSuffix}`,
        money(item.p_indemnity),
        money(contractedByItem.get(item.id) ?? 0),
      ]),
      { right: [3, 4], widths: ['auto', '*', 'auto', 'auto', 'auto'] },
    ),
  ];
}

function pricesBlock(items: LeaseItem[], block: ContractBlock): Content[] {
  if (block.kind !== 'prices') return [];

  const { columns } = block;

  return [
    table(
      [
        columns.product,
        columns.daily,
        columns.weekly,
        columns.biweekly,
        columns.monthly,
      ],
      items.map((item) => [
        `${item.equipmentCode}-${item.equipmentSuffix} ${item.equipmentName}`,
        money(item.p_diary),
        moneyOrDash(item.p_weekly),
        moneyOrDash(item.p_biweekly),
        moneyOrDash(item.p_monthly),
      ]),
      { right: [1, 2, 3, 4], widths: ['*', 'auto', 'auto', 'auto', 'auto'] },
    ),
  ];
}

export function contractDefinition(
  contract: ELeaseById,
  statement: StatementDto,
  template: ContractTemplate,
): TDocumentDefinitions {
  const issuer: DocumentIssuer = template.issuer;
  const contractedByItem = new Map(
    statement.positions.map((position) => [
      position.units[0].itemId,
      position.contracted,
    ]),
  );
  const values: Record<string, string> = {
    issuerName: issuer.name,
    issuerTaxId: issuer.taxId,
    issuerAddress: issuer.address,
    issuerPhone: issuer.phone,
    issuerCity: issuer.city,
    contractId: contract.id,
    start: date(contract.startDate),
    end: date(contract.endDate),
    total: money(statement.totals.contracted),
    today: today(),
  };

  const content = template.content.blocks.flatMap((block): Content[] => {
    switch (block.kind) {
      case 'title':
        return [title(fill(block.text, values))];
      case 'section':
        return [section(fill(block.text, values))];
      case 'paragraph':
      case 'clause':
        return [paragraph(fill(block.text, values))];
      case 'renter':
        return renterBlock(contract, block);
      case 'items':
        return itemsBlock(contract.leaseItems, contractedByItem, block);
      case 'prices':
        return pricesBlock(contract.leaseItems, block);
      case 'signatures':
        return [
          signatures(fill(block.left, values), fill(block.right, values)),
        ];
    }
  });

  return documentOf(content, { logo: template.logo, issuer });
}
