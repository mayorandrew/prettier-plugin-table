declare module 'prettier/plugins/estree.js' {
  import { Printer } from 'prettier';
  export const printers: {
    estree: Printer;
  };
} 
