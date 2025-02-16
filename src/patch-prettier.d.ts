declare module 'prettier/plugins/estree.mjs' {
  import { Printer } from 'prettier';
  export const printers: {
    estree: Printer;
  };
} 
