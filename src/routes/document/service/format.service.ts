import { Injectable } from '@nestjs/common';
import {
  Document,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  AlignmentType,
  WidthType,
  Packer,
  BorderStyle,
  VerticalAlign,
  Header,
  ImageRun,
  HorizontalPositionRelativeFrom,
  VerticalPositionRelativeFrom,
  TextWrappingType,
  VerticalPositionAlign,
  HorizontalPositionAlign,
} from 'docx';
import * as fs from 'fs';
import * as path from 'path';
import contractModel from '../utils/contract.json';
import { labelValue, text12, text9 } from '../helper/textFormat.helper';
import { money, moneyOrDash } from '../helper/report.helper';
import { ELeaseById } from 'src/routes/elease/types/eLeaseById';
import { LeaseItem } from 'generated/prisma/client';
import type { StatementDto } from 'src/routes/finantial/billing/statement';

@Injectable()
export class FormatService {
  constructor() {}
  async contract(data: ELeaseById, statement: StatementDto): Promise<Buffer> {
    const lessee = data.lessee;
    const equipments = data.leaseItems;
    const contractedByItem = new Map(
      statement.positions.map((position) => [
        position.units[0].itemId,
        position.contracted,
      ]),
    );
    const { equipment, client, clientLessee, headers, paragraph } =
      contractModel;

    const startDate = new Date(data.startDate).toLocaleDateString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
    });
    const endDate = new Date(data.endDate).toLocaleDateString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
    });

    const noBorders = {
      top: { style: BorderStyle.NONE, size: 0 },
      bottom: { style: BorderStyle.NONE, size: 0 },
      left: { style: BorderStyle.NONE, size: 0 },
      right: { style: BorderStyle.NONE, size: 0 },
      insideHorizontal: { style: BorderStyle.NONE, size: 0 },
      insideVertical: { style: BorderStyle.NONE, size: 0 },
    };

    const logo = fs.readFileSync(
      path.resolve(process.cwd(), 'src/global/assets/logo.png'),
    );

    const signatures = new Table({
      width: {
        size: 100,
        type: WidthType.PERCENTAGE,
      },
      borders: noBorders,
      rows: [
        new TableRow({
          children: [
            new TableCell({
              children: [
                new Paragraph({
                  text: '____________________________________________',
                  alignment: AlignmentType.CENTER,
                }),
              ],
            }),
            new TableCell({
              children: [
                new Paragraph({
                  text: '____________________________________________',
                  alignment: AlignmentType.CENTER,
                }),
              ],
            }),
          ],
        }),
        new TableRow({
          children: [
            new TableCell({
              children: [
                new Paragraph({
                  text: headers.titles.owner,
                  alignment: AlignmentType.CENTER,
                }),
              ],
            }),
            new TableCell({
              children: [
                new Paragraph({
                  text: headers.titles.renter,
                  alignment: AlignmentType.CENTER,
                }),
              ],
            }),
          ],
        }),
      ],
    });

    const header = new Header({
      children: [
        new Paragraph({
          children: [
            new ImageRun({
              data: logo,
              type: 'png',
              transformation: {
                width: 286,
                height: 138,
              },
              floating: {
                horizontalPosition: {
                  relative: HorizontalPositionRelativeFrom.PAGE,
                  align: HorizontalPositionAlign.CENTER,
                },
                verticalPosition: {
                  relative: VerticalPositionRelativeFrom.PAGE,
                  align: VerticalPositionAlign.CENTER,
                },
                wrap: {
                  type: TextWrappingType.NONE,
                },
              },
            }),
          ],
        }),
      ],
    });

    const equipmentRows = equipments.map((eq: LeaseItem) => {
      return new TableRow({
        children: [
          new TableCell({
            verticalAlign: VerticalAlign.CENTER,
            children: [text12(String(1))],
          }),
          new TableCell({
            verticalAlign: VerticalAlign.CENTER,
            children: [text12(eq.equipmentName ?? '')],
          }),
          new TableCell({
            verticalAlign: VerticalAlign.CENTER,
            children: [
              text12(`${eq.equipmentCode ?? ''}-${eq.equipmentSuffix ?? ''}`),
            ],
          }),
          new TableCell({
            verticalAlign: VerticalAlign.CENTER,
            children: [text12(money(eq.p_indemnity))],
          }),
          new TableCell({
            verticalAlign: VerticalAlign.CENTER,
            children: [text12(money(contractedByItem.get(eq.id) ?? 0))],
          }),
        ],
      });
    });

    const equipmentTable = new Table({
      width: {
        size: 100,
        type: WidthType.PERCENTAGE,
      },
      borders: noBorders,
      rows: [
        new TableRow({
          children: [
            new TableCell({
              verticalAlign: VerticalAlign.CENTER,
              children: [text12(equipment.table.columns.quantity, true)],
            }),
            new TableCell({
              verticalAlign: VerticalAlign.CENTER,
              children: [text12(equipment.table.columns.product, true)],
            }),
            new TableCell({
              verticalAlign: VerticalAlign.CENTER,
              children: [text12(equipment.table.columns.model, true)],
            }),
            new TableCell({
              verticalAlign: VerticalAlign.CENTER,
              children: [text12(equipment.table.columns.indemnity, true)],
            }),
            new TableCell({
              verticalAlign: VerticalAlign.CENTER,
              children: [text12(equipment.table.columns.elease, true)],
            }),
          ],
        }),
        ...equipmentRows,
      ],
    });

    const priceHeader = [
      equipment.table.columns.product,
      equipment.table.columns.daily,
      equipment.table.columns.weekly,
      equipment.table.columns.biweekly,
      equipment.table.columns.monthly,
    ];

    const priceTable = new Table({
      width: {
        size: 100,
        type: WidthType.PERCENTAGE,
      },
      borders: noBorders,
      rows: [
        new TableRow({
          children: priceHeader.map(
            (label) =>
              new TableCell({
                verticalAlign: VerticalAlign.CENTER,
                children: [text12(label, true)],
              }),
          ),
        }),
        ...equipments.map(
          (eq: LeaseItem) =>
            new TableRow({
              children: [
                `${eq.equipmentName} ${eq.equipmentCode}-${eq.equipmentSuffix}`,
                money(eq.p_diary),
                moneyOrDash(eq.p_weekly),
                moneyOrDash(eq.p_biweekly),
                moneyOrDash(eq.p_monthly),
              ].map(
                (value) =>
                  new TableCell({
                    verticalAlign: VerticalAlign.CENTER,
                    children: [text12(value)],
                  }),
              ),
            }),
        ),
      ],
    });

    const clientTable = new Table({
      width: {
        size: 100,
        type: WidthType.PERCENTAGE,
      },
      borders: noBorders,
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: {
                size: 40,
                type: WidthType.PERCENTAGE,
              },
              children: [
                labelValue(client.table.columns.name, lessee.client.name),
              ],
            }),
            new TableCell({
              width: {
                size: 30,
                type: WidthType.PERCENTAGE,
              },
              children: [
                labelValue(client.table.columns.tax_id, lessee.client.tax_id),
              ],
            }),
            new TableCell({
              width: {
                size: 30,
                type: WidthType.PERCENTAGE,
              },
              children: [
                labelValue(
                  client.table.columns.phone,
                  lessee.client.phone ?? '',
                ),
              ],
            }),
          ],
        }),
        new TableRow({
          children: [
            new TableCell({
              columnSpan: 2,
              children: [
                labelValue(
                  client.table.columns.address,
                  `${lessee.client.address ?? ''}, ${lessee.client.neighborhood ?? ''}, ${lessee.client.city ?? ''}/${lessee.client.state ?? ''}`,
                ),
              ],
            }),
            new TableCell({
              children: [
                labelValue(client.table.columns.zipcode, lessee.client.zipcode),
              ],
            }),
          ],
        }),
        new TableRow({
          children: [
            new TableCell({
              columnSpan: 3,
              children: [
                labelValue(
                  clientLessee.table.columns.tax_address,
                  `${lessee.address}, ${lessee.neighborhood}, ${lessee.city}/${lessee.state}`,
                ),
              ],
            }),
          ],
        }),
        new TableRow({
          children: [
            new TableCell({
              columnSpan: 2,
              children: [
                labelValue(clientLessee.table.columns.place, lessee.name),
              ],
            }),
            new TableCell({
              children: [
                labelValue(clientLessee.table.columns.zipcode, lessee.zipcode),
              ],
            }),
          ],
        }),
      ],
    });

    const contract = new Document({
      sections: [
        {
          headers: {
            default: header,
          },
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({
                  font: 'CALIBRI',
                  text: headers.titles.eleaseContract,
                  bold: true,
                  size: 32,
                }),
              ],
            }),

            new Paragraph(''),

            new Paragraph(paragraph.start),

            new Paragraph(''),

            clientTable,

            new Paragraph(''),

            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({
                  font: 'CALIBRI',
                  text: headers.titles.contractValue,
                  bold: true,
                }),
              ],
            }),

            new Paragraph(''),

            equipmentTable,

            new Paragraph(''),

            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({
                  font: 'CALIBRI',
                  text: headers.titles.priceTable,
                  bold: true,
                }),
              ],
            }),

            new Paragraph(''),

            priceTable,

            new Paragraph(''),

            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({
                  font: 'CALIBRI',
                  text: headers.titles.rentDate,
                  bold: true,
                }),
              ],
            }),

            new Paragraph(''),

            new Paragraph(
              `${paragraph.startDate} ${startDate} ${paragraph.endDate} ${endDate}.`,
            ),

            new Paragraph(''),

            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({
                  font: 'CALIBRI',
                  text: headers.titles.contractValue,
                  bold: true,
                }),
              ],
            }),

            new Paragraph(''),

            new Paragraph(
              `${paragraph.totalValue} ${money(statement.totals.contracted)}`,
            ),

            new Paragraph(''),

            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({
                  font: 'CALIBRI',
                  text: headers.titles.conditions,
                  bold: true,
                }),
              ],
            }),

            new Paragraph(''),

            text9(paragraph.clausules.first),
            new Paragraph(''),
            text9(paragraph.clausules.firstParagraph),
            new Paragraph(''),
            text9(paragraph.clausules.secondParagraph),
            new Paragraph(''),
            text9(paragraph.clausules.second),
            new Paragraph(''),
            text9(paragraph.clausules.third),
            new Paragraph(''),
            text9(paragraph.clausules.fourth),
            new Paragraph(''),
            text9(paragraph.clausules.fifth),
            new Paragraph(''),
            text9(paragraph.clausules.sixthParagraph),
            new Paragraph(''),
            text9(paragraph.clausules.sixth),
            new Paragraph(''),
            text9(paragraph.clausules.seventh),
            new Paragraph(''),
            text9(paragraph.clausules.eighth),
            new Paragraph(''),
            text9(paragraph.clausules.nineth),
            new Paragraph(''),
            text9(paragraph.clausules.tenth),
            new Paragraph(''),
            text9(paragraph.clausules.eleventh),
            new Paragraph(''),
            text9(paragraph.clausules.twelveth),
            new Paragraph(''),
            text9(paragraph.clausules.thirteenth),
            new Paragraph(''),
            text9(paragraph.clausules.fourteenth),
            new Paragraph(''),
            text9(paragraph.clausules.fifteenth),
            new Paragraph(''),
            text9(paragraph.clausules.sixteenth),
            new Paragraph(''),
            text9(paragraph.clausules.seventeenth),
            new Paragraph(''),
            text9(paragraph.clausules.footer),
            new Paragraph(''),
            text9(
              `Local e data: Contagem, ${new Date().toLocaleDateString(
                'pt-BR',
                { timeZone: 'America/Sao_Paulo' },
              )}`,
            ),
            new Paragraph({
              spacing: {
                after: 600,
              },
            }),

            signatures,
          ],
        },
      ],
    });

    const buffer = await Packer.toBuffer(contract);
    return buffer;
  }
}
