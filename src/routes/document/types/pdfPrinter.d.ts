declare module 'pdfmake/src/printer' {
  import type { Readable } from 'node:stream';
  import type {
    TDocumentDefinitions,
    TFontDictionary,
  } from 'pdfmake/interfaces';

  class PdfPrinter {
    constructor(fonts: TFontDictionary);

    createPdfKitDocument(definition: TDocumentDefinitions): Readable & {
      end(): void;
    };
  }

  export = PdfPrinter;
}
