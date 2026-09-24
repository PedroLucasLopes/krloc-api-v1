import { AlignmentType, Paragraph, TextRun } from 'docx';

export const text9 = (text: string, bold = false) =>
  new Paragraph({
    children: [
      new TextRun({
        text,
        font: 'Calibri',
        size: 18,
        bold,
      }),
    ],
  });

export const text12 = (text: string, bold = false) =>
  new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [
      new TextRun({
        text,
        font: 'Calibri',
        size: 24,
        bold,
      }),
    ],
  });

export const labelValue = (label: string, value: string) =>
  new Paragraph({
    children: [
      new TextRun({
        text: `${label}: `,
        bold: true,
        font: 'Calibri',
        size: 24,
      }),
      new TextRun({
        text: value ?? '',
        font: 'Calibri',
        size: 24,
      }),
    ],
  });
