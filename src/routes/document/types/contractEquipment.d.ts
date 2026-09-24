export type ContractEquipment = {
  equipment: {
    table: {
      columns: {
        quantity: string;
        product: string;
        model: string;
        indemnity: string;
        elease: string;
        currency: string;
      };
    };
  };
  client: {
    table: {
      columns: {
        name: string;
        tax_id: string;
        phone: string;
        address: string;
        zipcode: string;
      };
    };
  };
  clientLessee: {
    table: {
      columns: {
        tax_address: string;
        place: string;
        zipcode: string;
      };
    };
  };
  headers: {
    titles: {
      eleaseContract: string;
      owner: string;
      renter: string;
      leasedItems: string;
      rentDate: string;
      contractValue: string;
      conditions: string;
    };
  };
  paragraph: {
    start: string;
    startDate: string;
    endDate: string;
    totalValue: string;
    clausules: {
      first: string;
      firstParagraph: string;
      secondParagraph: string;
      second: string;
      third: string;
      fourth: string;
      fifth: string;
      sixthParagraph: string;
      sixth: string;
      seventh: string;
      eighth: string;
      nineth: string;
      tenth: string;
      eleventh: string;
      twelveth: string;
      thirteenth: string;
      fourteenth: string;
      fifteenth: string;
      sixteenth: string;
      seventeenth: string;
      footer: string;
    };
  };
};
