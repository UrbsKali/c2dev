declare module 'milsymbol' {
  export interface SymbolOptions {
    size?: number;
    uniqueDesignation?: string;
  }

  export class Symbol {
    constructor(sidc: string, options?: SymbolOptions);
    setOptions(options: SymbolOptions): void;
    asSVG(): string;
  }

  const milsymbol: {
    Symbol: typeof Symbol;
  };

  export default milsymbol;
}
